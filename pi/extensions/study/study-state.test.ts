import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createEmptyChapterState,
  loadStudyState,
  migrateChapterState,
  resolveNextPhase,
  resolveNextTarget,
  saveStudyState,
  updatePhaseState,
} from "./study-state.ts";

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), "study-state-"));
}

async function chapter(root: string, slug: string): Promise<string> {
  const dir = join(root, slug);
  await mkdir(join(dir, "lab"), { recursive: true });
  await mkdir(join(dir, "review"), { recursive: true });
  return dir;
}

test("stub markdown migrates to not_started", async () => {
  const root = await project();
  const dir = await chapter(root, "ch-01-cache");
  await writeFile(join(dir, "diagnosis.md"), "# 사전진단 결과\n\n- 상태: 대기\n\n아직 채점 전입니다.\n");
  await writeFile(join(dir, "concept.md"), "# 개념 노트\n\n아직 개념 학습 전입니다.\n");
  await writeFile(join(dir, "lab", "README.md"), "# 실습\n\n## 단계\n- [ ] 1.\n");
  await writeFile(join(dir, "test.md"), "# 테스트\n\n학습 후 생성됩니다.\n");
  await writeFile(join(dir, "review", "schedule.md"), "# 복습\n\n학습 후 생성됩니다.\n");
  const migrated = await migrateChapterState(root, "ch-01-cache");
  assert.equal(migrated.diagnosis.status, "not_started");
  assert.equal(migrated.concept.status, "not_started");
  assert.equal(migrated.lab.status, "not_started");
  assert.equal(migrated.test.status, "not_started");
  assert.equal(migrated.review.status, "not_started");
});

test("real chapter records migrate to completed and relearn states", async () => {
  const root = await project();
  const dir = await chapter(root, "ch-02-read-through");
  await writeFile(join(dir, "diagnosis.md"), "- 상태: 채점 완료\n- diagnosisId: abc\n- 총점: 80 / 100\n");
  await writeFile(join(dir, "concept.md"), "# Chapter\n\n## 이 장에서 배우는 것\n" + "x".repeat(600));
  await writeFile(join(dir, "lab", "README.md"), "# Lab\n\n- [x] 1\n- [~] 2\n");
  await writeFile(join(dir, "lab", "result.md"), "evidence\n");
  await writeFile(join(dir, "test.md"), "Attempt 1\n미통과 — 재학습 필요\npassed: false\n");
  const migrated = await migrateChapterState(root, "ch-02-read-through");
  assert.equal(migrated.diagnosis.status, "completed");
  assert.equal(migrated.concept.status, "completed");
  assert.equal(migrated.lab.status, "completed");
  assert.equal(migrated.test.status, "relearn_required");
});

test("finishes an earlier started chapter before selecting a later chapter", () => {
  const first = createEmptyChapterState();
  first.diagnosis.status = "completed";
  first.concept.status = "completed";
  first.lab.status = "in_progress";
  const second = createEmptyChapterState();
  assert.equal(resolveNextPhase(first), "lab");
  const target = resolveNextTarget({
    version: 1,
    projectRoot: "/tmp/study",
    createdAt: "x",
    updatedAt: "x",
    chapters: { "ch-03-started": first, "ch-04-not-started": second },
  });
  assert.deepEqual(target, { chapterSlug: "ch-03-started", phase: "lab" });
});

test("review does not block the next chapter core workflow", () => {
  const first = createEmptyChapterState();
  first.diagnosis.status = "completed";
  first.concept.status = "completed";
  first.lab.status = "completed";
  first.test.status = "completed";
  const second = createEmptyChapterState();
  const target = resolveNextTarget({
    version: 1,
    projectRoot: "/tmp/study",
    createdAt: "x",
    updatedAt: "x",
    chapters: { "ch-01-finished": first, "ch-02-next": second },
  });
  assert.deepEqual(target, { chapterSlug: "ch-02-next", phase: "diagnosis" });
});

test("persists phase updates atomically", async () => {
  const root = await project();
  await chapter(root, "ch-01-cache");
  const state = await loadStudyState(root);
  updatePhaseState(state, "ch-01-cache", "diagnosis", { status: "awaiting_review", sessionId: "d1", score: 80, maxScore: 100 });
  await saveStudyState(root, state);
  const loaded = await loadStudyState(root);
  assert.equal(loaded.chapters["ch-01-cache"].diagnosis.status, "awaiting_review");
  assert.equal(loaded.chapters["ch-01-cache"].diagnosis.sessionId, "d1");
  const raw = await readFile(join(root, ".study", "state.json"), "utf8");
  assert.match(raw, /awaiting_review/);
});
