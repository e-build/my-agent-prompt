import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDiagnosisReviewPrompt } from "./diagnosis-review-prompt.ts";

const session = {
  id: "diagnosis-1",
  chapterSlug: "ch-01-cache",
  chapterTitle: "캐싱 기초",
  diagnosisMdPath: "ch-01-cache/diagnosis.md",
};
const payload = {
  score: 67, maxScore: 100, level: "normal", learningPreference: "ready_to_continue",
  weaknesses: ["concept_gap: CAS 동작"],
  learnerPinpoints: [{ id: "q5", score: 0, maxScore: 10, status: "wrong", prompt: "CAS 동작?", comment: "예시 요청" }],
};

test("review handoff preserves assessment metadata, weaknesses and pinpoints", async () => {
  const prompt = await buildDiagnosisReviewPrompt(session, payload);
  for (const text of ["DIAGNOSIS_RESULTS_REVIEWED", "diagnosis-1", "ch-01-cache", "캐싱 기초", "67/100", "level: normal", "ready_to_continue", "concept_gap: CAS 동작", "q5 (0/10, wrong): CAS 동작? — 예시 요청", session.diagnosisMdPath]) {
    assert.ok(prompt.includes(text), text);
  }
  assert.match(prompt, /비중 조절 신호/);
});

test("explain_first keeps explanation before recall questions", async () => {
  const prompt = await buildDiagnosisReviewPrompt(session, { ...payload, learningPreference: "explain_first" });
  assert.match(prompt, /같은 회상 질문을 다시 요구하지 말고/);
  assert.match(prompt, /이해 확인은 이후 변형 문제/);
});

test("review handoff tolerates absent optional payload and diagnosis path", async () => {
  const prompt = await buildDiagnosisReviewPrompt({ ...session, diagnosisMdPath: null }, null);
  assert.match(prompt, /총점: \?\/\?/);
  assert.doesNotMatch(prompt, /diagnosisMdPath:/);
});

for (const learningPreference of ["ready_to_continue", "explain_first"]) {
  test(`${learningPreference} handoff includes the current canonical concept instructions`, async () => {
    const instructions = (await readFile(new URL("./instructions/concept.md", import.meta.url), "utf8")).trim();
    const prompt = await buildDiagnosisReviewPrompt(session, { ...payload, learningPreference });
    assert.ok(prompt.includes(instructions), "review ack must include the same current phase instructions as the command");
    assert.match(prompt, /README\.md/);
    assert.match(prompt, /새 `concept\.md`는 만들지 않는다/);
  });
}
