import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAnswer, createCard, readScope } from "../../src/cards/card-store.ts";
import { computeTestResult } from "../../src/flow/test-result.ts";
import type { QuestionCard } from "../../src/channel/channel.ts";

const card: QuestionCard = {
  kind: "question",
  id: "c-t1",
  projectSlug: "p",
  chapterSlug: "ch-01-a",
  purpose: "test",
  askConfidence: false,
  items: [
    { id: "q1", prompt: "?", maxScore: 2 },
    { id: "q2", prompt: "?", maxScore: 3 },
  ],
};
const criteria = { q1: { answer: "a", rubric: "r" }, q2: { answer: "b", rubric: "r" } };
const base = { cardId: "c-t1", assistance: "independent" as const, reason: "r", response: "x" };

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "tr-"));
  await mkdir(join(root, "ch-01-a"));
  await createCard(root, card, criteria);
  return root;
}

test("pass is computed from recorded scores, not declared", async () => {
  const root = await setup();
  await appendAnswer(root, "ch-01-a", { ...base, itemId: "q1", result: "demonstrated", score: 2 });
  await appendAnswer(root, "ch-01-a", { ...base, itemId: "q2", result: "partial", score: 2 });
  const result = computeTestResult(await readScope(root, "ch-01-a"), "c-t1", 4);
  assert.deepEqual(result, { total: 4, max: 5, passScore: 4, passed: true, weak: ["q2"] });
});

test("missing answers or scores block the result and list item ids", async () => {
  const root = await setup();
  await appendAnswer(root, "ch-01-a", { ...base, itemId: "q1", result: "demonstrated" });
  assert.throws(() => computeTestResult({ cards: {}, answers: [] }, "c-t1", 1), /c-t1/);
  const scope = await readScope(root, "ch-01-a");
  assert.throws(() => computeTestResult(scope, "c-t1", 1), /q1.*q2|q2/);
});

test("only the first answer counts; corrections are learning records", async () => {
  const root = await setup();
  await appendAnswer(root, "ch-01-a", { ...base, itemId: "q1", result: "incorrect", score: 0 });
  await appendAnswer(root, "ch-01-a", {
    ...base,
    itemId: "q1",
    result: "demonstrated",
    score: 2,
    assistance: "explained",
    correctionOf: "first",
  });
  await appendAnswer(root, "ch-01-a", { ...base, itemId: "q2", result: "demonstrated", score: 3 });
  const result = computeTestResult(await readScope(root, "ch-01-a"), "c-t1", 4);
  assert.equal(result.total, 3);
  assert.equal(result.passed, false);
  assert.deepEqual(result.weak, ["q1"]);
});

test("test items need maxScore and the card must be a test card", async () => {
  const root = await mkdtemp(join(tmpdir(), "tr-"));
  await createCard(root, { ...card, id: "c-x", purpose: "review" }, criteria);
  assert.throws(() => computeTestResult({ cards: {}, answers: [] }, "c-x", 1), /c-x/);
  const scope = await readScope(root, "ch-01-a");
  assert.throws(() => computeTestResult(scope, "c-x", 1), /test/);
});

test("passScore must be within 0..max", async () => {
  const root = await setup();
  await appendAnswer(root, "ch-01-a", { ...base, itemId: "q1", result: "demonstrated", score: 2 });
  await appendAnswer(root, "ch-01-a", { ...base, itemId: "q2", result: "demonstrated", score: 3 });
  const scope = await readScope(root, "ch-01-a");
  assert.throws(() => computeTestResult(scope, "c-t1", 6), /passScore/);
});
