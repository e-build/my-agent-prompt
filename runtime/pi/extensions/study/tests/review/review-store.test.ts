import { test } from "node:test";
import assert from "node:assert/strict";
import { recordAnswer } from "../../src/evidence/evidence-store.ts";
import { prepareQuestion } from "../../src/evidence/question-store.ts";
import {
  loadSchedule,
  registerSchedules,
  reviewAnswerOptions,
} from "../../src/review/review-store.ts";
import { knowledgeWorkspace, scoredQuestion } from "../support/evidence-fixture.ts";

const origin = { projectId: "p-alpha", chapterSlug: "ch-01-intro" };

test("registering the same proposition from two chapters keeps one schedule", async (t) => {
  const { root, a } = await knowledgeWorkspace(t);
  const first = await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin });
  assert.deepEqual(first.created, [a.id]);
  const second = await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-05", origin: { ...origin, chapterSlug: "ch-02-x" } });
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.existing, [a.id]);
  const schedule = (await loadSchedule(root, a.id))!;
  assert.equal(schedule.dueDate, "2026-10-02");
  assert.equal(schedule.origin.chapterSlug, "ch-01-intro");
});

test("a completed schedule is not restarted by appearing in another chapter", async (t) => {
  const { root, a } = await knowledgeWorkspace(t);
  await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin });
  const { saveSchedule } = await import("../../src/review/review-store.ts");
  const s = (await loadSchedule(root, a.id))!;
  await saveSchedule(root, { ...s, status: "completed", dueDate: null }, s);
  const again = await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-11-01", origin });
  assert.deepEqual(again.created, []);
  assert.equal((await loadSchedule(root, a.id))!.status, "completed");
});

async function reviewQuestion(root: string, refs: any[]) {
  return prepareQuestion(root, scoredQuestion(refs, { requestId: `rv-${refs.length}`, purpose: "review", context: {} }) as any);
}

const answer = (questionId: string, findings: any[], overrides: Record<string, unknown> = {}) => ({
  submissionId: "s1",
  questionId,
  response: "답",
  responseAnchor: "session#1",
  assistance: "independent",
  submittedAt: "2026-10-02T03:00:00.000Z",
  findings,
  ...overrides,
});

test("one grouped answer advances each proposition by its own finding in the same change", async (t) => {
  const { root, a, b, refA, refB } = await knowledgeWorkspace(t);
  await registerSchedules(root, { knowledgeIds: [a.id, b.id], completedOn: "2026-10-01", origin });
  const q = await reviewQuestion(root, [refA, refB]);
  await recordAnswer(root, answer(q.id, [
    { ref: refA, result: "demonstrated", reason: "ok" },
    { ref: refB, result: "incorrect", reason: "x" },
  ]) as any, await reviewAnswerOptions(root));
  const sa = (await loadSchedule(root, a.id))!;
  const sb = (await loadSchedule(root, b.id))!;
  assert.equal(sa.dueDate, "2026-10-05");
  assert.equal(sa.nextStage, 1);
  assert.equal(sb.dueDate, "2026-10-03");
  assert.equal(sb.nextStage, 0);
  assert.equal(sb.history[0].outcome, "incorrect");
});

test("future-round answers are rejected before anything is written", async (t) => {
  const { root, a, refA } = await knowledgeWorkspace(t);
  await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin });
  const q = await reviewQuestion(root, [refA]);
  await assert.rejects(
    recordAnswer(root, answer(q.id, [{ ref: refA, result: "demonstrated", reason: "" }], { submittedAt: "2026-10-01T03:00:00.000Z" }) as any, await reviewAnswerOptions(root)),
    /미리/,
  );
  const { listEvidence } = await import("../../src/evidence/evidence-store.ts");
  assert.equal((await listEvidence(root)).length, 0);
});

test("unscheduled propositions in a review answer are left for linking, not invented", async (t) => {
  const { root, refA, a } = await knowledgeWorkspace(t);
  const q = await reviewQuestion(root, [refA]);
  await recordAnswer(root, answer(q.id, [{ ref: refA, result: "demonstrated", reason: "" }]) as any, await reviewAnswerOptions(root));
  assert.equal(await loadSchedule(root, a.id), null);
});

test("local date uses the workspace timezone", async (t) => {
  const { root, a, refA } = await knowledgeWorkspace(t);
  await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin });
  const q = await reviewQuestion(root, [refA]);
  // 2026-10-01T16:00Z is already 2026-10-02 in Seoul.
  await recordAnswer(root, answer(q.id, [{ ref: refA, result: "demonstrated", reason: "" }], { submittedAt: "2026-10-01T16:00:00.000Z" }) as any, await reviewAnswerOptions(root));
  assert.equal((await loadSchedule(root, a.id))!.history[0].localDate, "2026-10-02");
});
