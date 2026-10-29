import type { DiagnosisSession, TestSession } from "../study-sessions.ts";
import type { TestQuestionSet } from "../assessment-core.ts";

export function questionSet(): TestQuestionSet {
  return {
    version: "1.0",
    chapterSlug: "ch-01",
    chapterTitle: "Chapter",
    phase: "test",
    instructions: "Answer",
    totalPoints: 10,
    passScore: 7,
    attempt: 1,
    sections: [{ id: "core", title: "Core", questionIds: ["q1"] }],
    questions: [{ id: "q1", type: "essay", sectionId: "core", prompt: "Explain", points: 10 }],
  };
}

export function diagnosisSession(projectRoot = "/study"): DiagnosisSession {
  return {
    id: "d1",
    htmlPath: `${projectRoot}/diagnosis.html`,
    projectRoot,
    chapterSlug: "ch-01",
    chapterTitle: "Chapter",
    diagnosisMdPath: "ch-01/diagnosis.md",
    questionSet: questionSet(),
    createdAt: 0,
    status: "open",
    submission: null,
    grade: null,
  };
}

export function testSession(projectRoot = "/study"): TestSession {
  const { diagnosisMdPath: _, ...session } = diagnosisSession(projectRoot);
  return {
    ...session,
    grade: null,
    id: "t1",
    testMdPath: "ch-01/test.md",
    questionSet: questionSet(),
    passScore: 7,
    attempt: 1,
  };
}

export function testGrade() {
  return {
    kind: "study-test-grade",
    testId: "t1",
    attempt: 1,
    totalScore: 10,
    maxScore: 10,
    passScore: 7,
    passed: true,
    summary: "Good",
    weaknesses: [],
    recommendation: "Review",
    results: [
      {
        id: "q1",
        score: 10,
        maxScore: 10,
        status: "correct",
        correctAnswer: "Model",
        explanation: "Because",
        advice: "Review",
      },
    ],
  };
}
