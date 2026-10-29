import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnosisSession, testSession, testGrade } from "../support/fixtures.ts";
import { validateTestGrade } from "../../src/assessment/assessment-grade.ts";

import * as api from "../../src/bridge/study-prompts.ts";

test("grading prompts retain assessment identity, skeleton and learner answers", async () => {
  assert.equal(typeof api.buildGradingPrompt, "function", "extract grading prompts");
  const diagnosis = api.buildGradingPrompt(diagnosisSession(), {
    answers: [{ id: "q1", answer: "learner answer" }],
  });
  assert.match(diagnosis, /DIAGNOSIS_SUBMISSION_RECEIVED/);
  assert.match(diagnosis, /diagnosisId: d1/);
  assert.match(diagnosis, /learner answer/);
  assert.match(diagnosis, /DIAGNOSIS_GRADE_JSON/);
  const exam = api.buildTestGradingPrompt(testSession(), { answers: [] });
  assert.match(exam, /testId: t1/);
  assert.match(exam, /attempt: 1/);
  assert.match(exam, /passScore: 7/);
  assert.match(exam, /TEST_RESULTS_REVIEWED/);
});

test("test review uses stored scores and keeps explanation preference", async () => {
  assert.equal(typeof api.buildTestReviewPrompt, "function");
  const session = testSession();
  const prompt = api.buildTestReviewPrompt(
    {
      ...session,
      grade: {
        ...validateTestGrade(testGrade(), session.id, session.questionSet),
        totalScore: 5,
        maxScore: 10,
        passed: false,
        weaknesses: ["stored weakness"],
      },
    },
    { score: 10, passed: true, learningPreference: "explain_first" },
  );
  assert.match(prompt, /총점: 5\/10/);
  assert.match(prompt, /passed: false/);
  assert.match(prompt, /stored weakness/);
  assert.match(prompt, /먼저 설명/);
});

test("curriculum prompts preserve root and revision comments", async () => {
  assert.equal(typeof api.buildCurriculumReviewedPrompt, "function");
  const session = {
    id: "c1",
    projectRoot: "/study",
    projectSlug: "study",
    topic: "Topic",
    htmlPath: "/study/curriculum.html",
    createdAt: 0,
    status: "open" as const,
  };
  assert.match(api.buildCurriculumReviewedPrompt(session, {}), /nextChapter: ch-01/);
  const revision = api.buildCurriculumRevisionPrompt(session, {
    comment: "  fewer chapters  ",
    selectedChapters: ["ch-01"],
  });
  assert.match(revision, /projectRoot: \/study/);
  assert.match(revision, /selectedChapters: ch-01/);
  assert.match(revision, /\nfewer chapters$/);
});
