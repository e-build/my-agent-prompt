import { test } from "node:test";
import assert from "node:assert/strict";
import {
  correctCriteria,
  loadQuestion,
  prepareQuestion,
  publicQuestion,
} from "../../src/evidence/question-store.ts";
import { knowledgeWorkspace, scoredQuestion } from "../support/evidence-fixture.ts";
import { treeDigest } from "../support/workspace-fixture.ts";

test("criteria are stored before the public question is returned and never exposed", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  const prepared = await prepareQuestion(root, scoredQuestion([refA]));
  const stored = await loadQuestion(root, prepared.id);
  assert.equal(stored?.criteria?.answer, "A");
  assert.equal(stored?.criteriaRevisions.length, 1);
  const shown = JSON.stringify(prepared);
  assert.equal(shown.includes("값 없음"), false);
  assert.equal(shown.includes("rubric"), false);
  assert.equal(shown.includes("answer"), false);
  assert.deepEqual(prepared.options?.map((o) => o.id), ["A", "B"]);
  assert.deepEqual(publicQuestion(stored!), prepared);
});

test("scored questions require confirmed knowledge and complete criteria", async (t) => {
  const { root, refA, refU } = await knowledgeWorkspace(t);
  await assert.rejects(prepareQuestion(root, scoredQuestion([refU])), /확정/);
  await assert.rejects(prepareQuestion(root, scoredQuestion([])), /지식/);
  await assert.rejects(prepareQuestion(root, scoredQuestion([refA], { criteria: undefined })), /채점 기준/);
  await assert.rejects(
    prepareQuestion(root, scoredQuestion([{ ...refA, revisionId: "rev-unknown" }])),
    /버전/,
  );
  const unscored = await prepareQuestion(
    root,
    scoredQuestion([], { requestId: "req-2", scored: false, purpose: "prediction", criteria: undefined, options: undefined }),
  );
  assert.equal(unscored.scored, false);
});

test("retrying a request is idempotent; changing it requires a new request", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  const first = await prepareQuestion(root, scoredQuestion([refA]));
  const before = await treeDigest(root);
  const retry = await prepareQuestion(root, scoredQuestion([refA]));
  assert.equal(retry.id, first.id);
  assert.equal(await treeDigest(root), before);
  await assert.rejects(prepareQuestion(root, scoredQuestion([refA], { prompt: "다른 질문" })), /같은 requestId/);
  const other = await prepareQuestion(root, scoredQuestion([refA], { requestId: "req-9", prompt: "다른 질문" }));
  assert.notEqual(other.id, first.id);
});

test("criteria corrections append a revision with a reason", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  const q = await prepareQuestion(root, scoredQuestion([refA]));
  await assert.rejects(correctCriteria(root, q.id, { answer: "B", acceptable: [], rubric: "x", conditions: [] }, ""), /사유/);
  await correctCriteria(root, q.id, { answer: "B", acceptable: [], rubric: "정정", conditions: [] }, "문항 오류");
  const stored = (await loadQuestion(root, q.id))!;
  assert.equal(stored.criteriaRevisions.length, 2);
  assert.equal(stored.criteriaRevisions[0].criteria.answer, "A");
  assert.equal(stored.criteria!.answer, "B");
  assert.equal(stored.criteriaRevisions[1].reason, "문항 오류");
});

test("review questions without a project live under the root review area", async (t) => {
  const { root, refA, refB } = await knowledgeWorkspace(t);
  const q = await prepareQuestion(root, scoredQuestion([refA, refB], { purpose: "review", context: {} }));
  assert.match(q.id, /^q-/);
  assert.equal((await loadQuestion(root, q.id))?.location, "review/questions");
});
