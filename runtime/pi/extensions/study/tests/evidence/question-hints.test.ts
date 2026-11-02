import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIDENCE_RECORD_GUIDELINE, publicQuestionHint } from "../../src/evidence/question-hints.ts";

test("diagnosis questions remind the agent to ask a 0-10 confidence every time", () => {
  const hint = publicQuestionHint("diagnosis");
  assert.match(hint, /확신도\(0~10\)/);
  assert.match(hint, /질문 끝/);
});

test("other purposes carry no confidence reminder", () => {
  for (const purpose of ["concept-check", "prediction", "review", "lab", "test"] as const)
    assert.equal(publicQuestionHint(purpose), "");
});

test("the record guideline forbids guessing a confidence the learner did not state", () => {
  assert.match(CONFIDENCE_RECORD_GUIDELINE, /학습자가 직접 말한/);
  assert.match(CONFIDENCE_RECORD_GUIDELINE, /10으로 나눈/);
  assert.match(CONFIDENCE_RECORD_GUIDELINE, /비워/);
});
