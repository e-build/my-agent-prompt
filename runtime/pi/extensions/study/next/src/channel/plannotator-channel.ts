import { itemMarker, type Channel, type LearningCard } from "./channel.ts";
import { renderPlain } from "./render-card.ts";

export type ExecResult = { code: number; stdout: string; stderr: string };
export type ExecWithInput = (command: string, args: string[], input?: string) => Promise<ExecResult>;

/** Inbox markdown: one answerable block per item, plus one confidence block. */
export function renderInbox(card: LearningCard): string {
  if (card.kind !== "question") return renderPlain(card);
  const blocks = card.items.map((item) => {
    const kind = !item.choices?.length ? "question-text" : item.multi ? "question-multi" : "question";
    const lines = [`:::${kind}`, `${item.prompt} ${itemMarker(card.id, item.id)}`];
    if (item.context) lines.push("", item.context);
    if (item.choices?.length) lines.push("", ...item.choices.map((c) => `- [ ] ${c}`));
    lines.push(":::");
    return lines.join("\n");
  });
  if (card.askConfidence)
    blocks.push(
      `:::question-text\n확신도(0~10)를 숫자로 적어 주세요. ${itemMarker(card.id, "confidence")}\n:::`,
    );
  return blocks.join("\n\n");
}

function threadName(card: LearningCard): string {
  const scope =
    card.chapterSlug ??
    (card.kind === "question" && card.purpose === "placement" ? "placement" : "project");
  return `study · ${card.projectSlug} · ${scope}`;
}

function subject(card: LearningCard): string {
  return card.kind === "question" ? `study ${card.purpose} · ${card.id}` : card.title;
}

/**
 * Sends cards through `plannotator inbox call`. The `--session` value routes the
 * learner's reply back into the Pi session as a user message.
 */
export function createPlannotatorChannel(deps: {
  exec: ExecWithInput;
  sessionId: () => string;
  cwd: string;
}): Channel {
  return {
    id: "plannotator",
    async available() {
      return (await deps.exec("plannotator", ["inbox", "status", "--json"])).code === 0;
    },
    async deliver(card) {
      const body = renderInbox(card);
      const payload = {
        thread: threadName(card),
        subject: subject(card),
        body,
        idempotency_key: `study-${card.id}`,
        project_path: deps.cwd,
        ...(card.kind === "lesson" ? { attachments: card.attachments } : {}),
      };
      const result = await deps.exec(
        "plannotator",
        ["inbox", "call", "--session", deps.sessionId(), "send_message", "-"],
        JSON.stringify(payload),
      );
      if (result.code !== 0)
        throw new Error(result.stderr.trim() || `plannotator exit ${result.code}`);
      let parsed: { message_id?: string };
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        throw new Error("plannotator 응답을 해석하지 못했습니다.");
      }
      if (!parsed.message_id) throw new Error("plannotator 응답에 message_id가 없습니다.");
      return { ref: `plannotator:${parsed.message_id}`, publicText: body };
    },
  };
}
