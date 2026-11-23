import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAnswer,
  createCard,
  markDelivered,
  readScope,
  scopeOf,
} from "../../src/cards/card-store.ts";
import type { QuestionCard } from "../../src/channel/channel.ts";

const card: QuestionCard = {
  kind: "question",
  id: "c-1",
  projectSlug: "p",
  chapterSlug: "ch-01-a",
  purpose: "test",
  askConfidence: false,
  items: [
    { id: "q1", prompt: "?", maxScore: 2 },
    { id: "q2", prompt: "?", maxScore: 3 },
  ],
};
const criteria = { q1: { answer: "A", rubric: "r" }, q2: { answer: "B", rubric: "r" } };
const answer = {
  cardId: "c-1",
  itemId: "q1",
  response: "B",
  assistance: "independent" as const,
  result: "incorrect" as const,
  score: 0,
  reason: "r",
};

const root = () => mkdtemp(join(tmpdir(), "cards-"));

test("scope is the chapter, or placement for project-wide cards", () => {
  assert.equal(scopeOf(card), "ch-01-a");
  assert.equal(scopeOf({ ...card, chapterSlug: undefined, purpose: "placement" }), "placement");
});

test("criteria are required for every question item", async () => {
  const dir = await root();
  await assert.rejects(createCard(dir, card, { q1: criteria.q1 }), /q2/);
  await createCard(dir, card, criteria);
  const scope = await readScope(dir, "ch-01-a");
  assert.equal(scope.cards["c-1"].status, "undelivered");
  assert.deepEqual(scope.cards["c-1"].criteria, criteria);
});

test("creating the same card twice is idempotent, but different content is refused", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  await createCard(dir, card, criteria);
  await assert.rejects(
    createCard(dir, { ...card, items: [card.items[0]] }, { q1: criteria.q1 }),
    /c-1/,
  );
  assert.equal(Object.keys((await readScope(dir, "ch-01-a")).cards).length, 1);
});

test("lesson and notice cards need no criteria", async () => {
  const dir = await root();
  await createCard(dir, { kind: "notice", id: "c-5", projectSlug: "p", chapterSlug: "ch-01-a", title: "t", body: "b" });
  assert.equal((await readScope(dir, "ch-01-a")).cards["c-5"].criteria, undefined);
});

test("answers append; a second answer for one item must be a correction", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  await markDelivered(dir, "ch-01-a", "c-1", { ref: "chat:c-1" });
  await appendAnswer(dir, "ch-01-a", answer);
  await assert.rejects(
    appendAnswer(dir, "ch-01-a", { ...answer, response: "A", result: "demonstrated" }),
    /correctionOf/,
  );
  await appendAnswer(dir, "ch-01-a", {
    ...answer,
    response: "A",
    assistance: "explained",
    result: "demonstrated",
    score: 2,
    correctionOf: "first",
  });
  const scope = await readScope(dir, "ch-01-a");
  assert.equal(scope.answers.length, 2);
  assert.equal(scope.answers[0].response, "B");
  assert.equal(scope.cards["c-1"].status, "delivered");
  assert.equal(scope.cards["c-1"].ref, "chat:c-1");
});

test("the confidence pseudo-item is accepted without criteria", async () => {
  const dir = await root();
  await createCard(dir, { ...card, askConfidence: true }, criteria);
  await appendAnswer(dir, "ch-01-a", {
    cardId: "c-1",
    itemId: "confidence",
    response: "7",
    assistance: "independent",
    result: "unverified",
    reason: "확신도 응답",
  });
  assert.equal((await readScope(dir, "ch-01-a")).answers.length, 1);
});

test("answers for unknown cards or items are rejected", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  await assert.rejects(appendAnswer(dir, "ch-01-a", { ...answer, cardId: "c-x" }), /c-x/);
  await assert.rejects(appendAnswer(dir, "ch-01-a", { ...answer, itemId: "q9" }), /q9/);
});

test("confidence must be between 0 and 1 and scores within maxScore", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  await assert.rejects(appendAnswer(dir, "ch-01-a", { ...answer, confidence: 7 }), /confidence/);
  await assert.rejects(appendAnswer(dir, "ch-01-a", { ...answer, score: 3 }), /score/);
});

test("unknown enum values are rejected", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  await assert.rejects(
    appendAnswer(dir, "ch-01-a", { ...answer, result: "great" as never }),
    /result/,
  );
  await assert.rejects(
    appendAnswer(dir, "ch-01-a", { ...answer, assistance: "lots" as never }),
    /assistance/,
  );
});

test("scope names are validated so files stay under .study/cards", async () => {
  const dir = await root();
  await assert.rejects(readScope(dir, "../x"), /scope/);
});

test("the file is jsonl under .study/cards", async () => {
  const dir = await root();
  await createCard(dir, card, criteria);
  const text = await readFile(join(dir, ".study", "cards", "ch-01-a.jsonl"), "utf8");
  assert.equal(text.trim().split("\n").length, 1);
  assert.equal(JSON.parse(text).type, "card");
});

test("an empty scope reads as no cards", async () => {
  assert.deepEqual(await readScope(await root(), "placement"), { cards: {}, answers: [] });
});
