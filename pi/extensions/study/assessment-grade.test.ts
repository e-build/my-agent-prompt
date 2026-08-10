import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { persistTestRecord, validateDiagnosisGrade, validateTestGrade } from "./assessment-grade.ts";
import type { AssessmentQuestionSet, TestQuestionSet } from "./assessment-core.ts";

function set(): TestQuestionSet {
  return {
    version: "1.0",
    chapterSlug: "ch-01",
    chapterTitle: "Chapter",
    phase: "test",
    instructions: "Answer",
    totalPoints: 20,
    passScore: 14,
    attempt: 1,
    sections: [{ id: "core", title: "Core", questionIds: ["q1", "q2"] }],
    questions: [
      { id: "q1", type: "single-choice", sectionId: "core", prompt: "One?", points: 10, options: [{ id: "A", text: "A" }, { id: "B", text: "B" }] },
      { id: "q2", type: "essay", sectionId: "core", prompt: "Explain", points: 10 },
    ],
  };
}

function grade() {
  return {
    kind: "study-test-grade",
    testId: "t1",
    attempt: 1,
    totalScore: 15,
    maxScore: 20,
    passScore: 999,
    passed: false,
    summary: "Good",
    weaknesses: ["q2"],
    recommendation: "Review q2",
    results: [
      { id: "q1", score: 10, maxScore: 10, status: "correct", correctAnswer: "A", explanation: "Because", advice: "None" },
      { id: "q2", score: 5, maxScore: 10, status: "partial", correctAnswer: "Model", explanation: "Partial", advice: "More detail" },
    ],
  };
}

test("normalizes passed and passScore from the server question set", () => {
  const validated = validateTestGrade(grade(), "t1", set());
  assert.equal(validated.passScore, 14);
  assert.equal(validated.passed, true);
});

test("rejects missing, duplicate, score mismatch and attempt mismatch", () => {
  const missing = grade();
  missing.results = missing.results.slice(0, 1) as typeof missing.results;
  assert.throws(() => validateTestGrade(missing, "t1", set()), /누락/);
  const duplicate = grade();
  duplicate.results[1] = { ...duplicate.results[0] };
  assert.throws(() => validateTestGrade(duplicate, "t1", set()), /중복/);
  const mismatch = grade();
  mismatch.totalScore = 99;
  assert.throws(() => validateTestGrade(mismatch, "t1", set()), /점수 합계/);
  const attempt = grade();
  attempt.attempt = 2;
  assert.throws(() => validateTestGrade(attempt, "t1", set()), /attempt/);
});

test("validates diagnosis identity and level", () => {
  const questionSet = set() as AssessmentQuestionSet;
  const raw = { ...grade(), kind: "study-diagnosis-grade", diagnosisId: "d1", level: "fast" };
  delete (raw as any).testId;
  delete (raw as any).attempt;
  delete (raw as any).passScore;
  delete (raw as any).passed;
  const result = validateDiagnosisGrade(raw, "d1", questionSet);
  assert.equal(result.level, "fast");
});

test("rejects assessment markdown paths outside the project", async () => {
  const root = await mkdtemp(join(tmpdir(), "assessment-grade-"));
  const questionSet = set();
  const validated = validateTestGrade(grade(), "t1", questionSet);
  await assert.rejects(() => persistTestRecord({
    projectRoot: root,
    mdPath: "../outside.md",
    questionSet,
    submission: { answers: [] },
    grade: validated,
  }), /프로젝트 밖 경로/);
});

test("persists test attempts append-only and structured assessment record", async () => {
  const root = await mkdtemp(join(tmpdir(), "assessment-grade-"));
  const questionSet = set();
  const validated = validateTestGrade(grade(), "t1", questionSet);
  const args = {
    projectRoot: root,
    mdPath: "ch-01/test.md",
    questionSet,
    submission: { answers: [{ id: "q1", answer: "A" }, { id: "q2", answer: "Text" }] },
    grade: validated,
  };
  await persistTestRecord(args);
  await persistTestRecord(args);
  const markdown = await readFile(join(root, "ch-01", "test.md"), "utf8");
  assert.equal(markdown.match(/## Attempt 1/g)?.length, 1);
  assert.match(markdown, /제출 답안: A/);
  const record = JSON.parse(await readFile(join(root, ".study", "assessments", "t1.json"), "utf8"));
  assert.equal(record.grade.passed, true);
});
