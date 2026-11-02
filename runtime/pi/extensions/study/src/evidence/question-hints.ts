import type { QuestionPurpose } from "./evidence-types.ts";

/**
 * Appended to the tool result of study_question_prepare. Phase instructions are
 * sent once at the start of a session; this reminder arrives with every
 * question, so a long dialogue does not drift away from asking confidence.
 */
export function publicQuestionHint(purpose: QuestionPurpose): string {
  if (purpose !== "diagnosis") return "";
  return "보여 줄 때 질문 끝에 `답과 함께 확신도(0~10)도 적어 주세요.`를 붙이세요.";
}

export const CONFIDENCE_RECORD_GUIDELINE =
  "study_answer_record의 confidence에는 학습자가 직접 말한 확신도(0~10)를 10으로 나눈 값만 넣으세요. 말하지 않았으면 비워 두고, 답의 말투로 추측하지 마세요.";
