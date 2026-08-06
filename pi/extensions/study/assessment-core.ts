export type AssessmentKind = "diagnosis" | "test";
export type QuestionType = "single-choice" | "multiple-choice" | "short-answer" | "essay" | "code" | "sql";
export type AssessmentStatus = "open" | "submitted" | "graded" | "acknowledged";
export type TestNextAction = "review" | "relearn";

export type AssessmentOption = {
  id: string;
  label?: string;
  text: string;
};

export type AssessmentSection = {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  questionIds: string[];
};

export type AssessmentQuestion = {
  id: string;
  type: QuestionType;
  sectionId: string;
  prompt: string;
  description?: string;
  points: number;
  required?: boolean;
  options?: AssessmentOption[];
  placeholder?: string;
  rubric?: string[];
  constraints?: string[] | Record<string, string | number | boolean>;
};

export type AssessmentQuestionSet = {
  version: "1.0";
  chapterSlug: string;
  chapterTitle: string;
  phase: string;
  instructions: string;
  totalPoints: number;
  sections: AssessmentSection[];
  questions: AssessmentQuestion[];
};

export type DiagnosisQuestionSet = AssessmentQuestionSet;

export type TestQuestionSet = AssessmentQuestionSet & {
  passScore: number;
  attempt: number;
};

export type AssessmentQuestionResult = {
  id: string;
  score: number;
  maxScore: number;
  status: "correct" | "partial" | "wrong" | "unanswered";
  correctAnswer: string;
  explanation: string;
  advice: string;
};

export type DiagnosisGrade = {
  kind: "study-diagnosis-grade";
  diagnosisId: string;
  totalScore: number;
  maxScore: number;
  level: "slow" | "normal" | "fast";
  summary: string;
  weaknesses: string[];
  recommendation: string;
  results: AssessmentQuestionResult[];
};

export type TestGrade = {
  kind: "study-test-grade";
  testId: string;
  attempt: number;
  totalScore: number;
  maxScore: number;
  passScore: number;
  passed: boolean;
  summary: string;
  weaknesses: string[];
  recommendation: string;
  results: AssessmentQuestionResult[];
};

export type TestHandoff = {
  score: number | null;
  maxScore: number | null;
  passScore: number;
  passed: boolean;
  weaknesses: string[];
  nextAction: TestNextAction;
};

export const DIAGNOSIS_GRADE_START = "<!--DIAGNOSIS_GRADE_JSON_START-->";
export const DIAGNOSIS_GRADE_END = "<!--DIAGNOSIS_GRADE_JSON_END-->";
export const TEST_GRADE_START = "<!--TEST_GRADE_JSON_START-->";
export const TEST_GRADE_END = "<!--TEST_GRADE_JSON_END-->";

export function validateAssessmentQuestionSet(payload: unknown, kind: AssessmentKind): asserts payload is AssessmentQuestionSet | TestQuestionSet {
  if (!payload || typeof payload !== "object") throw new Error("questionsJson object가 필요합니다.");
  const value = payload as Record<string, unknown>;
  if (!Array.isArray(value.questions)) throw new Error("questionsJson.questions 배열이 필요합니다.");
  if (!Array.isArray(value.sections)) throw new Error("questionsJson.sections 배열이 필요합니다.");

  const questions = value.questions as Array<Record<string, unknown>>;
  if (questions.length === 0) throw new Error("최소 1개 문항이 필요합니다.");

  const ids = new Set<string>();
  let sum = 0;
  for (const [index, question] of questions.entries()) {
    const id = typeof question.id === "string" ? question.id.trim() : "";
    if (!id) throw new Error(`${index + 1}번 문항 id가 필요합니다.`);
    if (ids.has(id)) throw new Error(`중복 문항 id입니다: ${id}`);
    ids.add(id);
    if (!isQuestionType(question.type)) throw new Error(`${id}의 type이 올바르지 않습니다.`);
    if (typeof question.prompt !== "string" || !question.prompt.trim()) throw new Error(`${id}의 prompt가 필요합니다.`);
    if (typeof question.sectionId !== "string" || !question.sectionId.trim()) throw new Error(`${id}의 sectionId가 필요합니다.`);
    const points = Number(question.points);
    if (!Number.isFinite(points) || points <= 0) throw new Error(`${id}의 points는 0보다 커야 합니다.`);
    sum += points;
    if ((question.type === "single-choice" || question.type === "multiple-choice") && (!Array.isArray(question.options) || question.options.length < 2)) {
      throw new Error(`${id} 선택형 문항에는 2개 이상의 options가 필요합니다.`);
    }
  }

  const totalPoints = Number(value.totalPoints);
  if (!Number.isFinite(totalPoints) || totalPoints <= 0) throw new Error("totalPoints는 0보다 커야 합니다.");
  if (Math.abs(sum - totalPoints) > 0.0001) throw new Error(`문항 배점 합계(${sum})와 totalPoints(${totalPoints})가 일치해야 합니다.`);

  if (kind === "diagnosis") validateDiagnosisComposition(questions);
  else validateTestFields(value, totalPoints);
}

export function validateDiagnosisComposition(questions: Array<Record<string, unknown>>): void {
  const total = questions.length;
  if (total < 10) throw new Error(`사전진단은 최소 10문항이어야 합니다. 현재 ${total}문항입니다.`);

  const objective = questions.filter((q) => q.type === "single-choice" || q.type === "multiple-choice").length;
  const shortAnswer = questions.filter((q) => q.type === "short-answer" || q.type === "code" || q.type === "sql").length;
  const essay = questions.filter((q) => q.type === "essay").length;
  const expectedObjective = Math.round(total * 0.7);
  const expectedShortAnswer = Math.round(total * 0.2);
  const expectedEssay = total - expectedObjective - expectedShortAnswer;
  const tolerance = total === 10 ? 0 : 1;
  const within = (actual: number, expected: number) => Math.abs(actual - expected) <= tolerance;

  if (!within(objective, expectedObjective) || !within(shortAnswer, expectedShortAnswer) || !within(essay, expectedEssay)) {
    throw new Error(
      `사전진단 문항 비중은 객관식 약 70%, 주관식 약 20%, 서술형 약 10%여야 합니다. ` +
        `현재: 총 ${total}문항 / 객관식 ${objective} / 주관식 ${shortAnswer} / 서술형 ${essay}. ` +
        `권장: 객관식 ${expectedObjective} / 주관식 ${expectedShortAnswer} / 서술형 ${expectedEssay}.`,
    );
  }
}

export function validateTestFields(value: Record<string, unknown>, totalPoints: number): void {
  const passScore = Number(value.passScore);
  if (!Number.isFinite(passScore) || passScore <= 0 || passScore > totalPoints) {
    throw new Error(`passScore는 0보다 크고 totalPoints(${totalPoints}) 이하여야 합니다.`);
  }
  const attempt = Number(value.attempt);
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("attempt는 1 이상의 정수여야 합니다.");
}

export function extractMarkedJson(text: string, startMarker: string, endMarker: string): unknown | null {
  const startIdx = text.indexOf(startMarker);
  if (startIdx < 0) return null;
  const endIdx = text.indexOf(endMarker, startIdx + startMarker.length);
  if (endIdx < 0) return null;
  const segment = text.slice(startIdx + startMarker.length, endIdx);
  const fence = segment.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : segment).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export function resolvePassed(grade: Pick<TestGrade, "totalScore" | "passScore"> & { passed?: boolean }): boolean {
  if (typeof grade.passed === "boolean") return grade.passed;
  return Number(grade.totalScore) >= Number(grade.passScore);
}

export function resolveTestNextAction(passed: boolean): TestNextAction {
  return passed ? "review" : "relearn";
}

export function canSubmit(status: AssessmentStatus): boolean {
  return status === "open";
}

export function canAcknowledge(status: AssessmentStatus): boolean {
  return status === "graded";
}

function isQuestionType(value: unknown): value is QuestionType {
  return value === "single-choice" || value === "multiple-choice" || value === "short-answer" || value === "essay" || value === "code" || value === "sql";
}
