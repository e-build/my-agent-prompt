import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { listEvidence, recordAnswer } from "../../src/evidence/evidence-store.ts";
import { prepareQuestion } from "../../src/evidence/question-store.ts";
import { knowledgeWorkspace, scoredQuestion } from "../support/evidence-fixture.ts";

async function setup(t: any) {
  const ctx = await knowledgeWorkspace(t);
  const q = await prepareQuestion(ctx.root, scoredQuestion([ctx.refA, ctx.refB]));
  return { ...ctx, q };
}

const answer = (questionId: string, refs: any[], overrides: Record<string, unknown> = {}) => ({
  submissionId: "sub-1",
  questionId,
  response: "A — 만료되면 없다",
  responseAnchor: "session:abc#msg-12",
  assistance: "independent",
  submittedAt: "2026-10-30T02:00:00.000Z",
  findings: refs.map((ref) => ({ ref, result: "demonstrated", reason: "정확" })),
  ...overrides,
});

test("stores the original answer with per-proposition findings at the asked revision", async (t) => {
  const { root, q, refA, refB } = await setup(t);
  const evidence = await recordAnswer(root, answer(q.id, [refA, { ...refB }], {
    findings: [
      { ref: refA, result: "demonstrated", reason: "정확" },
      { ref: refB, result: "partial", reason: "조건 누락" },
    ],
  }));
  assert.equal(evidence.findings.length, 2);
  assert.equal(evidence.context.projectId, "p-alpha");
  const all = await listEvidence(root);
  assert.equal(all.length, 1);
  assert.equal(all[0].response, "A — 만료되면 없다");
});

test("retries are idempotent and conflicting retries are rejected", async (t) => {
  const { root, q, refA } = await setup(t);
  await recordAnswer(root, answer(q.id, [refA]));
  await recordAnswer(root, answer(q.id, [refA]));
  assert.equal((await listEvidence(root)).length, 1);
  await assert.rejects(recordAnswer(root, answer(q.id, [refA], { response: "다른 답" })), /같은 submissionId/);
});

test("corrections are appended and the first answer is kept", async (t) => {
  const { root, q, refA } = await setup(t);
  await recordAnswer(root, answer(q.id, [refA], { findings: [{ ref: refA, result: "incorrect", reason: "틀림" }] }));
  await recordAnswer(
    root,
    answer(q.id, [refA], { submissionId: "sub-2", response: "교정 후 답", assistance: "explained", correctionOf: "sub-1" }),
  );
  const all = await listEvidence(root, { questionId: q.id });
  assert.deepEqual(all.map((e) => e.response), ["A — 만료되면 없다", "교정 후 답"]);
  assert.equal(all[0].findings[0].result, "incorrect");
  await assert.rejects(
    recordAnswer(root, answer(q.id, [refA], { submissionId: "sub-3", correctionOf: "sub-missing" })),
    /교정 대상/,
  );
});

test("rejects findings for knowledge the question did not ask about or at another revision", async (t) => {
  const { root, q, refA } = await setup(t);
  const other = (await knowledgeWorkspace(t)).refA;
  await assert.rejects(recordAnswer(root, answer(q.id, [{ ...refA, id: "k-zzzzzzzz" }])), /질문에 없는/);
  await assert.rejects(recordAnswer(root, answer(q.id, [{ ...refA, revisionId: "rev-other" }])), /질문에 없는/);
  await assert.rejects(recordAnswer(root, answer(q.id, [refA], { assistance: "guess" })), /assistance/);
  await assert.rejects(recordAnswer(root, answer(q.id, [refA], { response: "" })), /response/);
  void other;
});

test("knowledge revisions after asking keep the evidence pointing at the old revision", async (t) => {
  const { root, q, refA, a } = await setup(t);
  await applyKnowledgeChange(root, { changeId: "rev", operation: "revise", id: a.id, expectedRevisionId: a.revisionId, reason: "정밀화", patch: { statement: "새 명제" } });
  const evidence = await recordAnswer(root, answer(q.id, [refA]));
  assert.equal(evidence.findings[0].ref.revisionId, refA.revisionId);
});

test("answers never write into the shared knowledge items", async (t) => {
  const { root, q, refA } = await setup(t);
  const before = await readdir(join(root, "knowledge", "items"));
  await recordAnswer(root, answer(q.id, [refA]));
  assert.deepEqual(await readdir(join(root, "knowledge", "items")), before);
});

test("unscored questions accept only unverified findings and an optional note", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  const q = await prepareQuestion(root, scoredQuestion([refA], { requestId: "p1", scored: false, purpose: "prediction", criteria: undefined }));
  await assert.rejects(recordAnswer(root, answer(q.id, [refA])), /비채점/);
  const e = await recordAnswer(root, answer(q.id, [refA], { findings: [], note: "직관은 맞음" }));
  assert.equal(e.note, "직관은 맞음");
});
