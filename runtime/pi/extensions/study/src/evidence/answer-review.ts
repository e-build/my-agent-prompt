import type { Demonstration } from "./evidence-types.ts";

/** One asked question with the learner's recorded answer, for the end-of-diagnosis explanation. */
export type AnswerReviewItem = {
  prompt: string;
  scored: boolean;
  options?: Array<{ id: string; text: string }>;
  /** The learner's own words as recorded; null when never answered. */
  response: string | null;
  /** 0~1 as recorded; absent when the learner did not say. */
  confidence?: number;
  result: Demonstration | null;
  /** Model answer from the criteria fixed before asking; null for unscored questions. */
  answer: string | null;
};

const VERDICT: Record<Demonstration, string> = {
  demonstrated: "맞음",
  partial: "부분 정답",
  incorrect: "틀림",
  unverified: "미확인",
};

function field(label: string, value: string): string {
  const text = value.trim();
  return text.includes("\n") ? `- ${label}:\n${text.split("\n").map((l) => `  > ${l}`).join("\n")}` : `- ${label}: ${text}`;
}

/**
 * Explanations given after the diagnosis must show what the learner answered:
 * a deferred explanation without the learner's words cannot be compared.
 */
export function formatAnswerReview(items: AnswerReviewItem[]): string {
  const blocks = items.map((item, i) => {
    const options = item.options?.length ? ` ${item.options.map((o) => `(${o.id}) ${o.text}`).join(" / ")}` : "";
    const lines = [field("질문", `${item.prompt}${options}`), field("내 답", item.response ?? "(응답 없음)")];
    if (item.confidence !== undefined) lines.push(`- 확신도: ${Math.round(item.confidence * 10)}/10`);
    if (!item.scored) lines.push("- 판정: 비채점");
    else if (item.result) lines.push(`- 판정: ${VERDICT[item.result]}`);
    if (item.answer) lines.push(field("정답", item.answer));
    return `### Q${i + 1}\n\n${lines.join("\n")}`;
  });
  return [
    "## 답 대조",
    "",
    "해설은 문항마다 위 '내 답'(학습자 원문 그대로)·확신도·판정을 먼저 보여 준 뒤 정답과 해설을 쓰세요.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}
