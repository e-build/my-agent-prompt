import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStudyState } from "./study-state.ts";
import * as completion from "./test-completion.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "test-completion-"));
  const chapter = join(root, "ch-01-cache");
  await mkdir(join(chapter, "lab"), { recursive: true });
  await mkdir(join(chapter, "review"), { recursive: true });
  await writeFile(join(chapter, "README.md"), "# Cache\n## 개념 학습 노트\n내용\n");
  await writeFile(join(chapter, "test.md"), "## Attempt 1\nPASSED\n");
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "s1", status: "completed" }] }));
  await writeFile(join(chapter, "lab", "results.md"), "- Step ID: `s1`\n");
  return { root, chapter };
}
const record = { id: "t1", attempt: 1, score: 80, maxScore: 100 };
async function finish(root: string, passed = true) {
  assert.equal(typeof completion.completeAcknowledgedTest, "function");
  return completion.completeAcknowledgedTest(root, "ch-01-cache", record, passed);
}

test("a navigation page failure cannot block an evidence-verified passed test", async () => {
  const { root, chapter } = await fixture();
  await writeFile(join(chapter, "review", "README.md"), "# 手書き\n独自記録\n");
  const result = await finish(root);
  assert.equal(result.status, "completed");
  assert.match(result.navigationWarning!, /既|既存|기존/);
  assert.equal((await loadStudyState(root)).chapters["ch-01-cache"].test.status, "completed");
});

test("missing execution evidence remains a separate completion blocker", async () => {
  const { root, chapter } = await fixture();
  await writeFile(join(chapter, "lab", "results.md"), "다른 기록\n");
  const result = await finish(root);
  assert.equal(result.status, "blocked");
  assert.match(result.evidenceError!, /결과 기록이 없는/);
  assert.match((await loadStudyState(root)).chapters["ch-01-cache"].test.reason!, /학습 근거 검증 실패/);
});

test("failed tests require relearning without generating review pages", async () => {
  const { root } = await fixture();
  const result = await finish(root, false);
  assert.equal(result.status, "relearn_required");
  assert.equal(result.pagePath, undefined);
});
