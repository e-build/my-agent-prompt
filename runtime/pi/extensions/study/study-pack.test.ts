import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStudyPack } from "./study-pack.ts";

test("builds a self-contained chapter study pack from README, lab evidence, and passed test", async () => {
  const root = await mkdtemp(join(tmpdir(), "study-pack-"));
  const chapter = join(root, "ch-01-cache");
  await mkdir(join(chapter, "lab"), { recursive: true });
  await mkdir(join(chapter, "review"), { recursive: true });
  await writeFile(join(chapter, "README.md"), "# Cache\n\n## 개념 학습 노트\n\nRead-through는 load 책임을 한곳에 둔다.\n");
  await writeFile(join(chapter, "test.md"), "# 테스트\n\n통과 여부: PASSED\n");
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({
    steps: [{ id: "step-1", title: "실습", status: "completed" }, { id: "step-2", title: "변형", status: "skipped_understood", skipEvidence: "개념 테스트 증거" }],
  }));
  await writeFile(join(chapter, "lab", "results.md"), "# 실습 결과\n\n## 실습\n\n- Step ID: `step-1`\n- 관찰: DB 조회는 한 번이었다.\n- 배운 점: hit는 원천 조회를 줄인다.\n\n## 변형\n\n- Step ID: `step-2`\n- 스킵 근거: 개념 테스트 증거\n");
  await writeFile(join(chapter, "diagnosis.md"), "# 진단\n\n초기 약점: load 책임 설명\n");

  const output = await buildStudyPack(root, "ch-01-cache", { score: 9, maxScore: 10, passScore: 8 });
  const pack = await readFile(output, "utf8");
  assert.match(output, /review\/study-pack\.md$/);
  assert.match(pack, /Read-through는 load 책임을 한곳에 둔다/);
  assert.match(pack, /DB 조회는 한 번이었다/);
  assert.match(pack, /초기 약점: load 책임 설명/);
  assert.match(pack, /9\/10/);
  assert.match(pack, /## 복습 회상 기록/);
  const previousRecall = pack.replace(/## 복습 회상 기록/, "## 복습 회상 기록\n\n- 1차 회상: ZSET score로 범위를 찾았다.");
  await writeFile(output, previousRecall);
  await buildStudyPack(root, "ch-01-cache", { score: 9, maxScore: 10, passScore: 8 });
  assert.match(await readFile(output, "utf8"), /1차 회상: ZSET score로 범위를 찾았다/);

  await mkdir(join(chapter, "review"), { recursive: true });
  await writeFile(join(chapter, "review", "blank-recall.md"), "이번 회상: payload와 ZSET index는 별도 키다.\n");
  await buildStudyPack(root, "ch-01-cache", { score: 9, maxScore: 10, passScore: 8 });
  const refreshed = await readFile(output, "utf8");
  assert.match(refreshed, /이번 회상: payload와 ZSET index는 별도 키다/);
  assert.equal((refreshed.match(/## 복습 회상 기록/g) ?? []).length, 1);
});

test("refuses to build a study pack when the README concept note is only a placeholder", async () => {
  const root = await mkdtemp(join(tmpdir(), "study-pack-empty-concept-"));
  const chapter = join(root, "ch-01-cache");
  await mkdir(join(chapter, "lab"), { recursive: true });
  await writeFile(join(chapter, "README.md"), "# Cache\n\n## 개념 학습 노트\n");
  await writeFile(join(chapter, "test.md"), "# 테스트\n\n통과 여부: PASSED\n");
  await writeFile(join(chapter, "lab", "results.md"), "# 결과\n\n완료 증거\n");
  await assert.rejects(() => buildStudyPack(root, "ch-01-cache"), /실제 학습 내용이 있는 개념 학습 노트/);
  await writeFile(join(chapter, "README.md"), "# Cache\n\n## 개념 학습 노트\n\n아직 개념 학습 전입니다.\n");
  await assert.rejects(() => buildStudyPack(root, "ch-01-cache"), /실제 학습 내용이 있는 개념 학습 노트/);
});

test("refuses to build a study pack when a completed lab step has no result record", async () => {
  const root = await mkdtemp(join(tmpdir(), "study-pack-missing-lab-step-"));
  const chapter = join(root, "ch-01-cache");
  await mkdir(join(chapter, "lab"), { recursive: true });
  await writeFile(join(chapter, "README.md"), "# Cache\n\n## 개념 학습 노트\n\n내용\n");
  await writeFile(join(chapter, "test.md"), "# 테스트\n\n통과 여부: PASSED\n");
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "step-1", status: "completed" }] }));
  await writeFile(join(chapter, "lab", "results.md"), "# 실습 결과\n\n다른 내용만 있음\n");
  await assert.rejects(() => buildStudyPack(root, "ch-01-cache"), /결과 기록이 없는 lab step/);

  await writeFile(join(chapter, "lab", "results.md"), "# 실습 결과\n\n- Step ID: `step-1`\n- 관찰: 확인함\n- 배운 점: 이해함\n");
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "step-1", status: "skipped_understood", skipEvidence: "문제 풀이에서 이미 설명함" }] }));
  await assert.rejects(() => buildStudyPack(root, "ch-01-cache"), /근거 기록이 없는 skipped lab step/);
});

test("refuses to build a study pack before the chapter test or lab record is complete", async () => {
  const root = await mkdtemp(join(tmpdir(), "study-pack-unpassed-"));
  const chapter = join(root, "ch-01-cache");
  await mkdir(join(chapter, "lab"), { recursive: true });
  await writeFile(join(chapter, "README.md"), "# Cache\n\n## 개념 학습 노트\n\n내용\n");
  await writeFile(join(chapter, "test.md"), "# 테스트\n\n통과 여부: PASSED\n");
  await assert.rejects(() => buildStudyPack(root, "ch-01-cache", { score: 5, maxScore: 10, passScore: 8 }), /lab\/results.md/);

  await writeFile(join(chapter, "lab", "results.md"), "# 결과\n\n완료 증거\n");
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "s1", status: "in_progress" }] }));
  await assert.rejects(() => buildStudyPack(root, "ch-01-cache"), /완료되지 않은 lab step/);

  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "s1", status: "completed" }] }));
  await writeFile(join(chapter, "test.md"), "# 테스트\n\n## Attempt 1\n- 통과 여부: PASSED\n\n## Attempt 2\n- 통과 여부: 미통과 — 재학습 필요\n");
  await assert.rejects(() => buildStudyPack(root, "ch-01-cache"), /통과한 test.md/);
});
