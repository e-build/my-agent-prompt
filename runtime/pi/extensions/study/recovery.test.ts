import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findRecoverablePassedTest, markAssessmentAcknowledged } from "./assessment-grade.ts";
import { applyTestRecovery } from "./study-state.ts";
import type { TestQuestionSet } from "./assessment-core.ts";

function questionSet(): TestQuestionSet {
  return {
    version: "1.0",
    chapterSlug: "ch-01",
    chapterTitle: "Chapter",
    phase: "test",
    instructions: "Answer",
    totalPoints: 20,
    passScore: 14,
    attempt: 1,
    sections: [{ id: "core", title: "Core", questionIds: ["q1"] }],
    questions: [
      { id: "q1", type: "essay", sectionId: "core", prompt: "Explain", points: 20 },
    ],
  };
}

function record(id: string, attempt: number, passed: boolean, acknowledged: boolean): Record<string, unknown> {
  return {
    kind: "test",
    questionSet: questionSet(),
    submission: { answers: [] },
    grade: { kind: "study-test-grade", testId: id, attempt, totalScore: passed ? 18 : 5, maxScore: 20, passScore: 14, passed, summary: "", weaknesses: [], recommendation: "", results: [] },
    ...(acknowledged ? { acknowledgedAt: "2026-09-29T00:00:00.000Z" } : {}),
  };
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "study-recovery-"));
  await mkdir(join(root, ".study", "assessments"), { recursive: true });
  return root;
}

test("markAssessmentAcknowledged persists ack and recovery picks the highest acknowledged passed attempt", async () => {
  const root = await project();
  await writeFile(join(root, ".study", "assessments", "t1.json"), `${JSON.stringify(record("t1", 1, true, false), null, 2)}\n`);
  await writeFile(join(root, ".study", "assessments", "t2.json"), `${JSON.stringify(record("t2", 1, true, true), null, 2)}\n`);
  await writeFile(join(root, ".study", "assessments", "t3.json"), `${JSON.stringify(record("t3", 2, true, true), null, 2)}\n`);
  await writeFile(join(root, ".study", "assessments", "t4.json"), `${JSON.stringify(record("t4", 3, false, true), null, 2)}\n`);
  await writeFile(join(root, ".study", "assessments", "t5.json"), `${JSON.stringify({ ...record("t5", 9, true, true), questionSet: { ...questionSet(), chapterSlug: "ch-09" } }, null, 2)}\n`);

  const best = await findRecoverablePassedTest(root, "ch-01");
  assert.equal(best?.id, "t3");

  assert.equal(await markAssessmentAcknowledged(root, "t1"), true);
  const updated = JSON.parse(await readFile(join(root, ".study", "assessments", "t1.json"), "utf8"));
  assert.ok(updated.acknowledgedAt);
  assert.equal(await markAssessmentAcknowledged(root, "missing"), false);
});

test("applyTestRecovery completes a blocked test phase, clears the stale reason, and stays idempotent", async () => {
  const root = await project();
  const state = {
    version: 1,
    projectRoot: root,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    chapters: {
      "ch-01": {
        diagnosis: { status: "completed", updatedAt: "2026-09-01T00:00:00.000Z" },
        concept: { status: "completed", updatedAt: "2026-09-01T00:00:00.000Z" },
        lab: { status: "completed", updatedAt: "2026-09-01T00:00:00.000Z" },
        test: { status: "blocked", updatedAt: "2026-09-01T00:00:00.000Z", reason: "복습 묶음 생성 실패" },
        review: { status: "not_started", updatedAt: "2026-09-01T00:00:00.000Z" },
      },
    },
  };
  await mkdir(join(root, ".study"), { recursive: true });
  await writeFile(join(root, ".study", "state.json"), JSON.stringify(state, null, 2));
  await writeFile(join(root, ".study", "assessments", "t9.json"), `${JSON.stringify(record("t9", 1, true, true), null, 2)}\n`);

  const found = await findRecoverablePassedTest(root, "ch-01");
  assert.equal(found?.id, "t9");
  assert.equal(await applyTestRecovery(root, "ch-01", found!), true);

  const recovered = JSON.parse(await readFile(join(root, ".study", "state.json"), "utf8"));
  assert.equal(recovered.chapters["ch-01"].test.status, "completed");
  assert.equal(recovered.chapters["ch-01"].test.reason, undefined);
  assert.equal(recovered.chapters["ch-01"].test.score, 18);
  assert.equal(recovered.chapters["ch-01"].test.sessionId, "t9");

  assert.equal(await applyTestRecovery(root, "ch-01", found!), true);
  assert.equal(await applyTestRecovery(root, "ch-99", found!), false);
});
