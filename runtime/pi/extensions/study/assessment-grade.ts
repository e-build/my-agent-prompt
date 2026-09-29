import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  AssessmentQuestionResult,
  AssessmentQuestionSet,
  DiagnosisGrade,
  TestGrade,
  TestQuestionSet,
} from "./assessment-core.ts";
import { projectPath } from "./project-path.ts";

const STATUSES = new Set(["correct", "partial", "wrong", "unanswered"]);

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}가 필요합니다.`);
  return value;
}

function requiredStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label}는 문자열 배열이어야 합니다.`);
  return value as string[];
}

function pushError(errors: string[], error: unknown): void {
  errors.push(error instanceof Error ? error.message : String(error));
}

function validateResults(raw: unknown, questionSet: AssessmentQuestionSet): AssessmentQuestionResult[] {
  if (!Array.isArray(raw)) throw new Error("grade.results 배열이 필요합니다.");
  const byQuestion = new Map(questionSet.questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const errors: string[] = [];
  const results: AssessmentQuestionResult[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`grade.results[${index}]가 object여야 합니다.`);
      continue;
    }
    const value = item as Record<string, unknown>;
    let id = "";
    try {
      id = requiredString(value.id, `grade.results[${index}].id`);
    } catch (error) {
      pushError(errors, error);
      continue;
    }
    const question = byQuestion.get(id);
    if (!question) {
      errors.push(`알 수 없는 문항 result입니다: ${id}`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`중복 문항 result입니다: ${id}`);
      continue;
    }
    seen.add(id);
    const score = Number(value.score);
    const maxScore = Number(value.maxScore);
    if (!Number.isFinite(score) || score < 0 || score > question.points) errors.push(`${id} score는 0~${question.points} 범위여야 합니다.`);
    if (maxScore !== question.points) errors.push(`${id} maxScore(${Number.isFinite(maxScore) ? maxScore : "NaN"})는 문항 배점(${question.points})과 같아야 합니다.`);
    if (!STATUSES.has(String(value.status))) errors.push(`${id} status가 올바르지 않습니다. correct|partial|wrong|unanswered 중 하나여야 합니다.`);
    for (const field of ["correctAnswer", "explanation", "advice"] as const) {
      if (typeof value[field] !== "string" || !(value[field] as string).trim()) errors.push(`${id} ${field}가 필요합니다.`);
    }
    results.push({
      id,
      score: Number.isFinite(score) ? score : 0,
      maxScore: question.points,
      status: STATUSES.has(String(value.status)) ? (value.status as AssessmentQuestionResult["status"]) : "wrong",
      correctAnswer: typeof value.correctAnswer === "string" ? value.correctAnswer : "",
      explanation: typeof value.explanation === "string" ? value.explanation : "",
      advice: typeof value.advice === "string" ? value.advice : "",
    });
  }
  const missing = questionSet.questions.map((question) => question.id).filter((id) => !seen.has(id));
  if (missing.length) errors.push(`grade.results에 누락된 문항이 있습니다: ${missing.join(", ")}`);
  if (errors.length) throw new Error(`채점 JSON 오류 ${errors.length}건:\n- ${errors.join("\n- ")}`);
  return results;
}

function scoreSumOf(results: AssessmentQuestionResult[]): number {
  return results.reduce((sum, result) => sum + result.score, 0);
}

export function gradeResultsSkeleton(questionSet: AssessmentQuestionSet): Array<Record<string, unknown>> {
  return questionSet.questions.map((question) => ({
    id: question.id,
    score: 0,
    maxScore: question.points,
    status: "",
    correctAnswer: "",
    explanation: "",
    advice: "",
  }));
}

export function buildTestGradeSkeleton(questionSet: TestQuestionSet, testId: string): Record<string, unknown> {
  return {
    kind: "study-test-grade",
    testId,
    attempt: questionSet.attempt,
    totalScore: 0,
    maxScore: questionSet.totalPoints,
    passScore: questionSet.passScore,
    passed: false,
    summary: "",
    weaknesses: [],
    recommendation: "",
    results: gradeResultsSkeleton(questionSet),
  };
}

export function buildDiagnosisGradeSkeleton(questionSet: DiagnosisQuestionSet, diagnosisId: string): Record<string, unknown> {
  return {
    kind: "study-diagnosis-grade",
    diagnosisId,
    totalScore: 0,
    maxScore: questionSet.totalPoints,
    level: "normal",
    summary: "",
    weaknesses: [],
    recommendation: "",
    results: gradeResultsSkeleton(questionSet),
  };
}

export function validateDiagnosisGrade(raw: unknown, diagnosisId: string, questionSet: AssessmentQuestionSet): DiagnosisGrade {
  if (!raw || typeof raw !== "object") throw new Error("diagnosis grade object가 필요합니다.");
  const value = raw as Record<string, unknown>;
  if (value.kind !== "study-diagnosis-grade") throw new Error("diagnosis grade kind가 올바르지 않습니다.");
  if (value.diagnosisId !== diagnosisId) throw new Error(`diagnosisId가 현재 세션(${diagnosisId})과 일치해야 합니다.`);
  const results = validateResults(value.results, questionSet);
  const totalScore = scoreSumOf(results);
  const maxScore = Number(value.maxScore);
  if (maxScore !== questionSet.totalPoints) throw new Error(`maxScore(${Number.isFinite(maxScore) ? maxScore : "NaN"})와 totalPoints(${questionSet.totalPoints})가 일치해야 합니다.`);
  if (!new Set(["slow", "normal", "fast"]).has(String(value.level))) throw new Error("level은 slow|normal|fast 중 하나여야 합니다.");
  return {
    kind: "study-diagnosis-grade",
    diagnosisId,
    totalScore,
    maxScore,
    level: value.level as DiagnosisGrade["level"],
    summary: requiredString(value.summary, "summary"),
    weaknesses: requiredStringArray(value.weaknesses, "weaknesses"),
    recommendation: requiredString(value.recommendation, "recommendation"),
    results,
  };
}

export function validateTestGrade(raw: unknown, testId: string, questionSet: TestQuestionSet): TestGrade {
  if (!raw || typeof raw !== "object") throw new Error("test grade object가 필요합니다.");
  const value = raw as Record<string, unknown>;
  if (value.kind !== "study-test-grade") throw new Error("test grade kind가 올바르지 않습니다.");
  if (value.testId !== testId) throw new Error(`testId가 현재 세션(${testId})과 일치해야 합니다.`);
  if (Number(value.attempt) !== questionSet.attempt) throw new Error(`attempt가 현재 시도(${questionSet.attempt})와 일치해야 합니다.`);
  const results = validateResults(value.results, questionSet);
  const totalScore = scoreSumOf(results);
  const maxScore = Number(value.maxScore);
  if (maxScore !== questionSet.totalPoints) throw new Error(`maxScore(${Number.isFinite(maxScore) ? maxScore : "NaN"})와 totalPoints(${questionSet.totalPoints})가 일치해야 합니다.`);
  const passed = totalScore >= questionSet.passScore;
  return {
    kind: "study-test-grade",
    testId,
    attempt: questionSet.attempt,
    totalScore,
    maxScore,
    passScore: questionSet.passScore,
    passed,
    summary: requiredString(value.summary, "summary"),
    weaknesses: requiredStringArray(value.weaknesses, "weaknesses"),
    recommendation: requiredString(value.recommendation, "recommendation"),
    results,
  };
}

function answerMap(submission: unknown): Map<string, unknown> {
  const payload = submission && typeof submission === "object" ? submission as Record<string, unknown> : {};
  const answers = Array.isArray(payload.answers) ? payload.answers : Array.isArray(submission) ? submission : [];
  return new Map((answers as Array<Record<string, unknown>>).map((answer) => [String(answer.id), answer.answer]));
}

function answerText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value == null || value === "") return "(미응답)";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function resultMarkdown(questionSet: AssessmentQuestionSet, results: AssessmentQuestionResult[], submission: unknown): string {
  const answers = answerMap(submission);
  const resultById = new Map(results.map((result) => [result.id, result]));
  return questionSet.questions.map((question) => {
    const result = resultById.get(question.id)!;
    return [
      `### ${question.id}. ${question.prompt}`,
      "",
      `- 제출 답안: ${answerText(answers.get(question.id))}`,
      `- 점수: ${result.score}/${result.maxScore}`,
      `- 상태: ${result.status}`,
      `- 정답/모범 답안: ${result.correctAnswer}`,
      `- 해설: ${result.explanation}`,
      `- 보완점: ${result.advice}`,
    ].join("\n");
  }).join("\n\n");
}

async function writeStructuredRecord(projectRoot: string, id: string, record: unknown): Promise<void> {
  const path = join(projectRoot, ".study", "assessments", `${id}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

type StoredAssessmentRecord = {
  kind?: string;
  questionSet?: { chapterSlug?: string };
  grade?: { passed?: boolean; totalScore?: number; maxScore?: number; attempt?: number };
  acknowledgedAt?: string;
};

export async function markAssessmentAcknowledged(projectRoot: string, id: string): Promise<boolean> {
  const path = join(projectRoot, ".study", "assessments", `${id}.json`);
  let record: StoredAssessmentRecord & Record<string, unknown>;
  try {
    record = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return false;
  }
  if (record.kind !== "test") return false;
  record.acknowledgedAt = new Date().toISOString();
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return true;
}

export type RecoverablePassedTest = { id: string; attempt: number; score: number; maxScore: number };

export async function findRecoverablePassedTest(projectRoot: string, chapterSlug: string): Promise<RecoverablePassedTest | null> {
  const dir = join(projectRoot, ".study", "assessments");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  let best: RecoverablePassedTest | null = null;
  for (const file of entries.filter((name) => name.endsWith(".json"))) {
    let record: StoredAssessmentRecord;
    try {
      record = JSON.parse(await readFile(join(dir, file), "utf8"));
    } catch {
      continue;
    }
    if (record.kind !== "test" || record.questionSet?.chapterSlug !== chapterSlug) continue;
    if (record.grade?.passed !== true || !record.acknowledgedAt) continue;
    const attempt = Number(record.grade.attempt ?? 1);
    if (!best || attempt > best.attempt) {
      best = { id: file.replace(/\.json$/, ""), attempt, score: Number(record.grade.totalScore ?? 0), maxScore: Number(record.grade.maxScore ?? 0) };
    }
  }
  return best;
}

export async function persistDiagnosisRecord(args: {
  projectRoot: string;
  mdPath: string;
  questionSet: AssessmentQuestionSet;
  submission: unknown;
  grade: DiagnosisGrade;
}): Promise<void> {
  const path = projectPath(args.projectRoot, args.mdPath);
  const markdown = [
    `# 사전진단 결과 — ${args.questionSet.chapterTitle}`,
    "",
    "- 상태: 채점 완료",
    `- diagnosisId: ${args.grade.diagnosisId}`,
    `- 총점: ${args.grade.totalScore}/${args.grade.maxScore}`,
    `- 수준: ${args.grade.level}`,
    "",
    "## 요약",
    "",
    args.grade.summary,
    "",
    "## 취약 분야",
    "",
    ...(args.grade.weaknesses.length ? args.grade.weaknesses.map((item) => `- ${item}`) : ["- 없음"]),
    "",
    "## 권장 학습 방향",
    "",
    args.grade.recommendation,
    "",
    "## 문항별 결과",
    "",
    resultMarkdown(args.questionSet, args.grade.results, args.submission),
    "",
  ].join("\n");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, markdown, "utf8");
  await writeStructuredRecord(args.projectRoot, args.grade.diagnosisId, { kind: "diagnosis", questionSet: args.questionSet, submission: args.submission, grade: args.grade });
}

export async function persistTestRecord(args: {
  projectRoot: string;
  mdPath: string;
  questionSet: TestQuestionSet;
  submission: unknown;
  grade: TestGrade;
}): Promise<void> {
  const path = projectPath(args.projectRoot, args.mdPath);
  let existing = "";
  try { existing = await readFile(path, "utf8"); } catch { /* new file */ }
  const marker = `<!-- STUDY_TEST_ATTEMPT:${args.questionSet.attempt} -->`;
  if (!existing.includes(marker)) {
    const block = [
      marker,
      `## Attempt ${args.questionSet.attempt}`,
      "",
      `- testId: ${args.grade.testId}`,
      `- 총점: ${args.grade.totalScore}/${args.grade.maxScore}`,
      `- 통과 기준: ${args.grade.passScore}`,
      `- 통과 여부: ${args.grade.passed ? "PASSED" : "미통과 — 재학습 필요"}`,
      "",
      "### 요약",
      "",
      args.grade.summary,
      "",
      "### 취약 분야",
      "",
      ...(args.grade.weaknesses.length ? args.grade.weaknesses.map((item) => `- ${item}`) : ["- 없음"]),
      "",
      "### 권장 다음 행동",
      "",
      args.grade.recommendation,
      "",
      "### 문항별 결과",
      "",
      resultMarkdown(args.questionSet, args.grade.results, args.submission),
      "",
    ].join("\n");
    const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : `# 테스트 — ${args.questionSet.chapterTitle}\n\n`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${prefix}${block}`, "utf8");
  }
  await writeStructuredRecord(args.projectRoot, args.grade.testId, { kind: "test", questionSet: args.questionSet, submission: args.submission, grade: args.grade });
}
