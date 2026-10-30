import {
  DIAGNOSIS_GRADE_START,
  DIAGNOSIS_GRADE_END,
  TEST_GRADE_START,
  TEST_GRADE_END,
  resolvePassed,
  resolveTestNextAction,
} from "../assessment/assessment-core.ts";
import {
  buildDiagnosisGradeSkeleton,
  buildTestGradeSkeleton,
} from "../assessment/assessment-grade.ts";
import type {
  DiagnosisSession,
  TestSession,
  CurriculumSession,
} from "../session/study-sessions.ts";

export function buildGradingPrompt(session: DiagnosisSession, payload: unknown): string {
  const answers = JSON.stringify(extractAnswers(payload), null, 2);
  const lines = [
    "# DIAGNOSIS_SUBMISSION_RECEIVED",
    "",
    `- diagnosisId: ${session.id}`,
    `- chapterSlug: ${session.chapterSlug}`,
    `- chapterTitle: ${session.chapterTitle}`,
  ];
  if (session.diagnosisMdPath) lines.push(`- diagnosisMdPath: ${session.diagnosisMdPath}`);
  lines.push(
    "",
    "학습자가 브라우저 사전진단에서 답안을 제출했습니다. 아래를 수행하세요.",
    "",
    "1. 객관식/복수선택/주관식/서술형/코드·SQL 문항을 rubric과 비교해 채점.",
    "2. 문항별 score, status(correct|partial|wrong|unanswered), correctAnswer, explanation, advice 산출.",
    "3. totalScore, maxScore, level(slow|normal|fast), summary, weaknesses, recommendation 산출. 약점은 fact_gap/concept_gap/transfer_gap/execution_gap/ambiguous_question 관점으로 중립적으로 설명하고, 학습자를 복사·불성실로 단정하지 마세요.",
    "4. 파일은 직접 수정하지 마세요. extension이 검증된 grade를 diagnosis.md와 .study/assessments에 자동 기록합니다.",
    "5. 응답 끝에 반드시 아래 마커로 DIAGNOSIS_GRADE_JSON을 포함. diagnosisId 필드는 반드시 채울 것. results의 id/maxScore는 이미 문항 배점으로 채워져 있으니 그대로 두고 score/status/correctAnswer/explanation/advice만 채우세요. status는 correct|partial|wrong|unanswered 중 하나여야 합니다.",
    "",
    DIAGNOSIS_GRADE_START,
    "```json",
    JSON.stringify(buildDiagnosisGradeSkeleton(session.questionSet, session.id), null, 2),
    "```",
    DIAGNOSIS_GRADE_END,
    "",
    "6. 채점과 diagnosis.md 기록까지만 하고 멈추세요. 개념 학습으로 자동으로 넘어가지 마세요 — 학습자가 브라우저에서 결과를 충분히 확인한 뒤 DIAGNOSIS_RESULTS_REVIEWED 신호가 올 때까지 대기합니다.",
    "",
    "학습자 답안:",
    "```json",
    answers,
    "```",
  );
  return lines.join("\n");
}

export function buildTestGradingPrompt(session: TestSession, payload: unknown): string {
  const answers = JSON.stringify(extractAnswers(payload), null, 2);
  return [
    "# TEST_SUBMISSION_RECEIVED",
    "",
    `- testId: ${session.id}`,
    `- chapterSlug: ${session.chapterSlug}`,
    `- chapterTitle: ${session.chapterTitle}`,
    `- attempt: ${session.attempt}`,
    `- passScore: ${session.passScore}`,
    `- testMdPath: ${session.testMdPath}`,
    "",
    "학습자가 브라우저 테스트에서 답안을 제출했습니다.",
    "1. rubric과 챕터 concept/lab 범위를 기준으로 문항별 score/status/correctAnswer/explanation/advice를 산출하세요.",
    "2. totalScore, maxScore, passScore, passed, summary, weaknesses, recommendation을 산출하세요. 약점은 fact_gap/concept_gap/transfer_gap/execution_gap/ambiguous_question 관점으로 중립적으로 설명하고, 학습자를 복사·불성실로 단정하지 마세요.",
    "3. 파일은 직접 수정하지 마세요. extension이 검증된 attempt를 test.md와 .study/assessments에 자동 누적합니다.",
    "4. 응답 끝에 반드시 아래 TEST_GRADE_JSON을 포함하고 testId/attempt를 그대로 유지하세요. results의 id/maxScore는 이미 문항 배점으로 채워져 있으니 그대로 두고 score/status/correctAnswer/explanation/advice만 채우세요. status는 correct|partial|wrong|unanswered 중 하나여야 합니다.",
    "",
    TEST_GRADE_START,
    "```json",
    JSON.stringify(buildTestGradeSkeleton(session.questionSet, session.id), null, 2),
    "```",
    TEST_GRADE_END,
    "",
    "5. 채점과 test.md 기록까지만 하고 멈추세요. 학습자가 브라우저에서 결과를 확인하고 TEST_RESULTS_REVIEWED를 보낼 때까지 다음 단계로 넘어가지 마세요.",
    "",
    "학습자 답안:",
    "```json",
    answers,
    "```",
  ].join("\n");
}

export function buildCurriculumReviewedPrompt(
  session: CurriculumSession,
  payload: unknown,
  registration?: { status: string; root: string } | { error: string },
): string {
  const data = (payload && typeof payload === "object" ? payload : {}) as {
    nextChapter?: string;
    comment?: string;
  };
  const lines = [
    "# CURRICULUM_REVIEWED",
    "",
    `- curriculumId: ${session.id}`,
    `- projectRoot: ${session.projectRoot}`,
    `- projectSlug: ${session.projectSlug}`,
    `- topic: ${session.topic}`,
    `- nextChapter: ${data.nextChapter ?? "ch-01"}`,
  ];
  if (data.comment) lines.push(`- comment: ${data.comment}`);
  if (registration && "error" in registration)
    lines.push(`- studyRoot: 자동 등록 실패 — ${registration.error}`);
  else if (registration)
    lines.push(
      `- studyRoot: ${registration.root} (${registration.status === "created" ? "새 study 루트로 등록" : registration.status === "joined" ? "기존 study 루트에 프로젝트 추가" : "이미 등록됨"})`,
    );
  lines.push(
    "",
    "학습자가 브라우저에서 전체 학습 목차와 방향을 확인했습니다.",
    registration && !("error" in registration)
      ? "프로젝트는 study 루트에 자동 등록됐습니다. 등록 명령을 따로 안내하지 마세요. 다음 단계로 ch-01 사전진단을 안내하세요."
      : registration
        ? "자동 등록에 실패했습니다. 실패 이유를 짧게 알리고, 공통 지식·통합 복습은 해결 후 사용할 수 있다고 안내하세요. 다음 단계로 ch-01 사전진단을 안내하세요."
        : "다음 단계로 ch-01 사전진단을 안내하세요.",
    "종료 안내는 3줄 구조로 작성하세요: 완료 / 다음 / 실행.",
  );
  return lines.join("\n");
}

export function buildCurriculumRevisionPrompt(
  session: CurriculumSession,
  payload: unknown,
): string {
  const data = (payload && typeof payload === "object" ? payload : {}) as {
    comment?: string;
    selectedChapters?: string[];
  };
  const lines = [
    "# CURRICULUM_REVISION_REQUESTED",
    "",
    `- curriculumId: ${session.id}`,
    `- projectRoot: ${session.projectRoot}`,
    `- projectSlug: ${session.projectSlug}`,
    `- topic: ${session.topic}`,
  ];
  if (Array.isArray(data.selectedChapters) && data.selectedChapters.length)
    lines.push(`- selectedChapters: ${data.selectedChapters.join(", ")}`);
  lines.push(
    "",
    "학습자가 브라우저에서 커리큘럼 방향 조정을 요청했습니다.",
    "요청 내용을 반영해 README/챕터 README/SETUP/AGENTS.md 중 필요한 파일만 수정하세요.",
    "수정 후 같은 projectRoot를 지정해 study_curriculum_open을 호출하고 학습자가 브라우저에서 재확인하게 하세요.",
    "",
    "요청 내용:",
    data.comment?.trim() || "(내용 없음)",
  );
  return lines.join("\n");
}

export function buildTestReviewPrompt(session: TestSession, payload: unknown) {
  const data = (payload && typeof payload === "object" ? payload : {}) as {
    score?: number;
    maxScore?: number;
    passScore?: number;
    passed?: boolean;
    weaknesses?: string[];
    nextAction?: string;
    learningPreference?: "ready_to_continue" | "explain_first" | "practice_more" | "feels_guessed";
  };
  const stored = (session.grade && typeof session.grade === "object" ? session.grade : {}) as {
    totalScore?: number;
    maxScore?: number;
    passScore?: number;
    passed?: boolean;
    weaknesses?: string[];
  };
  const passed = resolvePassed({
    totalScore: Number(stored.totalScore ?? data.score ?? 0),
    passScore: session.passScore,
    passed: typeof stored.passed === "boolean" ? stored.passed : undefined,
  });
  const nextAction = resolveTestNextAction(passed);
  const weaknesses = Array.isArray(stored.weaknesses)
    ? stored.weaknesses
    : Array.isArray(data.weaknesses)
      ? data.weaknesses
      : [];
  const prompt = [
    "# TEST_RESULTS_REVIEWED",
    "",
    `- testId: ${session.id}`,
    `- chapterSlug: ${session.chapterSlug}`,
    `- chapterTitle: ${session.chapterTitle}`,
    `- attempt: ${session.attempt}`,
    `- 총점: ${stored.totalScore ?? data.score ?? "?"}/${stored.maxScore ?? data.maxScore ?? "?"}`,
    `- 통과 기준: ${session.passScore}`,
    `- passed: ${passed}`,
    `- nextAction: ${nextAction}`,
    `- learningPreference: ${data.learningPreference ?? "ready_to_continue"}`,
    ...(weaknesses.length ? [`- 취약 분야: ${weaknesses.join(", ")}`] : []),
    `- testMdPath: ${session.testMdPath}`,
    "",
    data.learningPreference === "explain_first"
      ? "학습자가 먼저 설명을 요청했습니다. 같은 답을 다시 요구하지 말고 오답/취약 개념을 직접 설명한 뒤 다음 행동으로 이어가세요."
      : passed
        ? "학습자가 테스트 결과를 확인했습니다. 이 챕터 테스트를 통과했으므로 /study-review 흐름으로 복습을 시작하세요."
        : "학습자가 테스트 결과를 확인했습니다. 전체 개념이나 lab을 반복하지 말고 weaknesses와 오답 문항에 해당하는 가장 작은 개념만 재학습하세요. 재학습 후에는 같은 문제를 재사용하지 말고 attempt를 1 올린 새 변형 TestQuestionSet을 만들어 study_test_open으로 다시 여세요.",
  ].join("\n");
  return prompt;
}

function extractAnswers(payload: unknown): unknown {
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as Record<string, unknown>).answers)
  ) {
    return (payload as Record<string, unknown>).answers;
  }
  return payload;
}
