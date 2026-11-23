import { itemMarker, type LearningCard } from "./channel.ts";

export const CONFIDENCE_LINE = "답과 함께 확신도(0~10)도 적어 주세요.";

/** Plain markdown used by the chat adapter and for non-question cards elsewhere. */
export function renderPlain(card: LearningCard): string {
  if (card.kind === "notice") return `### ${card.title}\n\n${card.body}`;
  if (card.kind === "lesson")
    return [`### ${card.title}`, "", card.summary, "", ...card.attachments.map((p) => `- ${p}`)].join(
      "\n",
    );
  const lines: string[] = [];
  for (const item of card.items) {
    lines.push(`**${item.prompt}** ${itemMarker(card.id, item.id)}`);
    if (item.context) lines.push("", item.context);
    if (item.choices?.length) lines.push("", ...item.choices.map((c) => `- ${c}`));
    lines.push("");
  }
  if (card.askConfidence) lines.push(CONFIDENCE_LINE);
  return lines.join("\n").trim();
}
