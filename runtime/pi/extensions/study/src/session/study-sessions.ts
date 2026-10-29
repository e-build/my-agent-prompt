import type {
  AssessmentQuestionSet,
  AssessmentStatus,
  TestQuestionSet,
  DiagnosisGrade,
  TestGrade,
} from "../assessment/assessment-core.ts";

export type DiagnosisSession = {
  id: string;
  htmlPath: string;
  projectRoot: string;
  chapterSlug: string;
  chapterTitle: string;
  diagnosisMdPath: string | null;
  questionSet: AssessmentQuestionSet;
  createdAt: number;
  status: AssessmentStatus;
  submission: unknown;
  grade: DiagnosisGrade | null;
};

export type TestSession = {
  id: string;
  htmlPath: string;
  projectRoot: string;
  chapterSlug: string;
  chapterTitle: string;
  testMdPath: string;
  questionSet: TestQuestionSet;
  passScore: number;
  attempt: number;
  createdAt: number;
  status: AssessmentStatus;
  submission: unknown;
  grade: TestGrade | null;
};

export type CurriculumSession = {
  id: string;
  htmlPath: string;
  projectRoot: string;
  projectSlug: string;
  topic: string;
  createdAt: number;
  status: "open" | "reviewed" | "revision_requested";
};

export type StudySessions = {
  sessions: Map<string, DiagnosisSession>;
  testSessions: Map<string, TestSession>;
  curriculumSessions: Map<string, CurriculumSession>;
};

export function createStudySessions(): StudySessions {
  return { sessions: new Map(), testSessions: new Map(), curriculumSessions: new Map() };
}
