import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canAcknowledge,
  canSubmit,
  DIAGNOSIS_GRADE_END,
  DIAGNOSIS_GRADE_START,
  extractMarkedJson,
  resolvePassed,
  resolveTestNextAction,
  TEST_GRADE_END,
  TEST_GRADE_START,
  validateAssessmentQuestionSet,
} from "./assessment-core.ts";

function question(id: string, type: string, points = 10) {
  return {
    id,
    type,
    sectionId: "core",
    prompt: `${id} prompt`,
    points,
    ...(type === "single-choice" || type === "multiple-choice"
      ? { options: [{ id: "A", text: "A" }, { id: "B", text: "B" }] }
      : {}),
  };
}

function diagnosisPayload() {
  const questions = [
    ...Array.from({ length: 7 }, (_, i) => question(`q${i + 1}`, "single-choice")),
    question("q8", "short-answer"),
    question("q9", "code"),
    question("q10", "essay"),
  ];
  return {
    version: "1.0",
    chapterSlug: "ch-01",
    chapterTitle: "Chapter",
    phase: "Phase 1 / diagnosis",
    instructions: "Answer",
    totalPoints: 100,
    sections: [{ id: "core", title: "Core", questionIds: questions.map((q) => q.id) }],
    questions,
  };
}

function testPayload() {
  const questions = Array.from({ length: 5 }, (_, i) => question(`t${i + 1}`, i < 3 ? "single-choice" : i === 3 ? "short-answer" : "essay", 20));
  return {
    version: "1.0",
    chapterSlug: "ch-01",
    chapterTitle: "Chapter",
    phase: "Phase 4 / test",
    instructions: "No hints",
    totalPoints: 100,
    passScore: 70,
    attempt: 1,
    sections: [{ id: "core", title: "Core", questionIds: questions.map((q) => q.id) }],
    questions,
  };
}

test("validates diagnosis composition", () => {
  assert.doesNotThrow(() => validateAssessmentQuestionSet(diagnosisPayload(), "diagnosis"));
});

test("rejects diagnosis with fewer than ten questions", () => {
  const payload = diagnosisPayload();
  payload.questions = payload.questions.slice(0, 9);
  payload.totalPoints = 90;
  payload.sections[0].questionIds = payload.questions.map((q) => q.id);
  assert.throws(() => validateAssessmentQuestionSet(payload, "diagnosis"), /최소 10문항/);
});

test("test accepts five mixed questions and validates passScore/attempt", () => {
  assert.doesNotThrow(() => validateAssessmentQuestionSet(testPayload(), "test"));
  const invalidScore = { ...testPayload(), passScore: 101 };
  assert.throws(() => validateAssessmentQuestionSet(invalidScore, "test"), /passScore/);
  const invalidAttempt = { ...testPayload(), attempt: 0 };
  assert.throws(() => validateAssessmentQuestionSet(invalidAttempt, "test"), /attempt/);
});

test("requires question points to equal totalPoints", () => {
  const payload = testPayload();
  payload.totalPoints = 90;
  assert.throws(() => validateAssessmentQuestionSet(payload, "test"), /배점 합계/);
});

test("accepts context metadata and rejects explanatory short-answer prompts", () => {
  const payload = testPayload();
  Object.assign(payload.questions[0], { context: "Shopl read-only cache", assumptions: ["refresh 실패"], learningObjective: "무기한 stale 구분" });
  assert.doesNotThrow(() => validateAssessmentQuestionSet(payload, "test"));
  const invalid = testPayload();
  invalid.questions[3].prompt = "왜 위험한지 설명하시오";
  assert.throws(() => validateAssessmentQuestionSet(invalid, "test"), /essay로 바꾸세요/);
});

test("extracts diagnosis and test marker JSON independently", () => {
  const diagnosis = extractMarkedJson(`${DIAGNOSIS_GRADE_START}\n\`\`\`json\n{"diagnosisId":"d1"}\n\`\`\`\n${DIAGNOSIS_GRADE_END}`, DIAGNOSIS_GRADE_START, DIAGNOSIS_GRADE_END);
  const grade = extractMarkedJson(`${TEST_GRADE_START}\n{"testId":"t1"}\n${TEST_GRADE_END}`, TEST_GRADE_START, TEST_GRADE_END);
  assert.deepEqual(diagnosis, { diagnosisId: "d1" });
  assert.deepEqual(grade, { testId: "t1" });
  assert.equal(extractMarkedJson(`${TEST_GRADE_START}{bad}${TEST_GRADE_END}`, TEST_GRADE_START, TEST_GRADE_END), null);
});

test("resolves pass boundary and next action", () => {
  assert.equal(resolvePassed({ totalScore: 69, passScore: 70 }), false);
  assert.equal(resolvePassed({ totalScore: 70, passScore: 70 }), true);
  assert.equal(resolvePassed({ totalScore: 10, passScore: 70, passed: true }), true);
  assert.equal(resolveTestNextAction(true), "review");
  assert.equal(resolveTestNextAction(false), "relearn");
});

test("idempotency state guards allow only first submit and first ack", () => {
  assert.equal(canSubmit("open"), true);
  assert.equal(canSubmit("submitted"), false);
  assert.equal(canSubmit("graded"), false);
  assert.equal(canAcknowledge("graded"), true);
  assert.equal(canAcknowledge("acknowledged"), false);
  assert.equal(canAcknowledge("submitted"), false);
});
