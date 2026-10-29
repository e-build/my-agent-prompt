import {
  DIAGNOSIS_GRADE_START,
  DIAGNOSIS_GRADE_END,
  TEST_GRADE_START,
  TEST_GRADE_END,
} from "./assessment-core.ts";

type AssessmentPage = {
  kind: "diagnosis" | "test";
  chapterSlug: string;
  chapterTitle: string;
  phase: string;
  questionsJson: string;
};

const CONFIG = {
  diagnosis: {
    kind: "diagnosis",
    title: "사전진단",
    submissionKind: "study-diagnosis-submission",
    submissionHeading: "DIAGNOSIS_SUBMISSION",
    returnFormat: "DIAGNOSIS_GRADE_JSON",
    markerStart: DIAGNOSIS_GRADE_START,
    markerEnd: DIAGNOSIS_GRADE_END,
    continueLabel: "Pi에서 개념 학습 시작 →",
    continueMessage: "개념 학습은 Pi에서 이어집니다.",
  },
  test: {
    kind: "test",
    title: "학습 완료 테스트",
    submissionKind: "study-test-submission",
    submissionHeading: "TEST_SUBMISSION",
    returnFormat: "TEST_GRADE_JSON",
    markerStart: TEST_GRADE_START,
    markerEnd: TEST_GRADE_END,
    continueLabel: "Pi에서 계속 →",
    continueMessage: "다음 학습 단계는 Pi에서 이어집니다.",
  },
};

export function renderAssessmentPage(template: string, page: AssessmentPage): string {
  const config = CONFIG[page.kind];
  return (
    template
      .replace(/{{CHAPTER_SLUG}}/g, escapeForHtml(page.chapterSlug))
      .replace(/{{CHAPTER_TITLE}}/g, escapeForHtml(page.chapterTitle))
      .replace(/{{PHASE}}/g, escapeForHtml(page.phase))
      .replace(/{{ASSESSMENT_KIND}}/g, page.kind)
      .replace(/{{ASSESSMENT_TITLE}}/g, config.title)
      .replace("{{ASSESSMENT_CONFIG_JSON}}", JSON.stringify(config))
      // Replace only the data script; the template also contains a literal guard.
      .replace("{{QUESTIONS_JSON}}", page.questionsJson)
  );
}

function escapeForHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
