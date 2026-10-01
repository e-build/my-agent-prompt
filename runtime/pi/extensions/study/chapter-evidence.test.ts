import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as evidence from "./chapter-evidence.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "chapter-evidence-"));
  const chapter = join(root, "ch-01-cache");
  await mkdir(join(chapter, "lab"), { recursive: true });
  await writeFile(join(chapter, "README.md"), "# Cache\n\n## 개념 학습 노트\n\n캐시 본문\n");
  await writeFile(join(chapter, "test.md"), "# 테스트\n\n## Attempt 1\n통과 여부: PASSED\n");
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "s1", status: "completed" }] }));
  await writeFile(join(chapter, "lab", "results.md"), "- Step ID: `s1`\n- 관찰: 확인\n- 배운 점: 이해\n");
  return { root, chapter };
}

async function validate(root: string) {
  assert.equal(typeof evidence.validateChapterEvidence, "function", "evidence validation must not depend on document generation");
  return evidence.validateChapterEvidence(root, "ch-01-cache");
}

test("validates chapter evidence without generating any review document", async () => {
  const { root, chapter } = await fixture();
  await validate(root);
  assert.ok(!(await readdir(chapter)).includes("review"));
});

test("rejects missing or placeholder canonical concept", async () => {
  const { root, chapter } = await fixture();
  for (const content of ["", "# Cache\n## 개념 학습 노트\n", "# Cache\n## 개념 학습 노트\n아직 개념 학습 전입니다."]) {
    await writeFile(join(chapter, "README.md"), content);
    await assert.rejects(() => validate(root), /README|개념 학습 노트/);
  }
});

test("validates the latest test attempt rather than an earlier pass", async () => {
  const { root, chapter } = await fixture();
  await writeFile(join(chapter, "test.md"), "## Attempt 1\nPASSED\n\n## Attempt 2\n미통과 — 재학습 필요\n");
  await assert.rejects(() => validate(root), /통과한 test.md/);
});

test("rejects missing lab evidence and incomplete or unrecorded steps", async () => {
  const { root, chapter } = await fixture();
  await writeFile(join(chapter, "lab", "results.md"), "");
  await assert.rejects(() => validate(root), /lab\/results.md/);
  await writeFile(join(chapter, "lab", "results.md"), "다른 결과\n");
  await assert.rejects(() => validate(root), /결과 기록이 없는/);
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "s1", status: "in_progress" }] }));
  await assert.rejects(() => validate(root), /완료되지 않은/);
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "s1", status: "skipped_understood", skipEvidence: "이미 설명함" }] }));
  await writeFile(join(chapter, "lab", "results.md"), "- Step ID: `s1`\n");
  await assert.rejects(() => validate(root), /근거 기록이 없는/);
});

test("findLabRecordGaps reports incomplete steps separately from completed record gaps", async () => {
  const { root, chapter } = await fixture();
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [
    { id: "s1", status: "completed" }, { id: "s2", status: "completed" },
    { id: "s3", status: "in_progress" }, { id: "s4", status: "skipped_understood", skipEvidence: "証拠" },
  ] }));
  const gaps = await evidence.findLabRecordGaps(root, "ch-01-cache");
  assert.deepEqual(gaps, { unfinishedSteps: ["s3"], missingResultSteps: ["s2", "s4"], missingSkippedEvidence: ["s4"] });
  assert.equal(await evidence.findLabRecordGaps(root, "ch-02-none"), null);
});
