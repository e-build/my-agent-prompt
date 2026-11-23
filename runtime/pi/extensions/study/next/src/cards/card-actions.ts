import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import type { Channel, LearningCard } from "../channel/channel.ts";
import type { StudyContext } from "../channel/channel-context.ts";
import { deliverWithFallback } from "../channel/select-channel.ts";
import { projectPath } from "../state/project-path.ts";
import {
  appendAnswer,
  createCard,
  markDelivered,
  scopeOf,
  type AnswerInput,
  type Criterion,
} from "./card-store.ts";

export type Channels = {
  primary: Channel;
  fallback: Channel;
  /** Test seam: runs after criteria are stored and before delivery. */
  beforeDeliver?: () => Promise<void>;
};

type CardInput = Record<string, unknown> & { id?: string; projectSlug?: string; kind?: string };

const newId = () => `c-${randomBytes(4).toString("hex")}`;

function complete(context: StudyContext, input: CardInput): LearningCard {
  if (input.projectSlug && input.projectSlug !== context.projectSlug)
    throw new Error(`이 프로젝트(${context.projectSlug})의 카드가 아닙니다: ${input.projectSlug}`);
  return { ...input, id: input.id ?? newId(), projectSlug: context.projectSlug } as LearningCard;
}

function deliveryMessage(channelId: string, publicText: string, fallback?: string): string {
  const lines = fallback ? [`fallback: ${fallback}`, ""] : [];
  if (channelId === "chat")
    lines.push("아래 내용을 학습자에게 그대로 보여 주세요.", "", publicText);
  else
    lines.push(
      `${channelId}로 보냈습니다. 채팅에 질문을 다시 쓰지 마세요. 학습자의 답장이 세션으로 들어오면 [cardId/itemId] 표시로 기록하세요.`,
    );
  return lines.join("\n");
}

async function deliver(context: StudyContext, card: LearningCard, channels: Channels) {
  await channels.beforeDeliver?.();
  const delivery = await deliverWithFallback(channels.primary, channels.fallback, card);
  await markDelivered(context.projectRoot, scopeOf(card), card.id, {
    ref: delivery.ref,
    ...(delivery.fallback ? { fallback: delivery.fallback } : {}),
  });
  const channelId = delivery.ref.split(":")[0];
  return deliveryMessage(channelId, delivery.publicText, delivery.fallback);
}

/** Stores hidden criteria first, then delivers the public question. */
export async function ask(
  context: StudyContext,
  input: { card: CardInput; criteria: Record<string, Criterion> },
  channels: Channels,
): Promise<{ cardId: string; message: string }> {
  if (input.card.kind !== "question") throw new Error("study_ask는 question 카드만 보냅니다.");
  const card = complete(context, input.card);
  await createCard(context.projectRoot, card, input.criteria);
  const message = await deliver(context, card, channels);
  return { cardId: card.id, message: `cardId: ${card.id}\n${message}` };
}

export async function send(
  context: StudyContext,
  input: { card: CardInput },
  channels: Channels,
): Promise<{ cardId: string; message: string }> {
  if (input.card.kind === "question") throw new Error("질문은 study_ask로 보내세요.");
  if (input.card.kind !== "lesson" && input.card.kind !== "notice")
    throw new Error(`알 수 없는 카드 종류입니다: ${input.card.kind}`);
  let card = complete(context, input.card);
  if (card.kind === "lesson") {
    const attachments = [];
    for (const relative of card.attachments) {
      const absolute = projectPath(context.projectRoot, relative);
      try {
        await stat(absolute);
      } catch {
        throw new Error(`첨부 파일이 없습니다: ${relative}`);
      }
      attachments.push(absolute);
    }
    card = { ...card, attachments };
  }
  await createCard(context.projectRoot, card);
  return { cardId: card.id, message: await deliver(context, card, channels) };
}

export async function recordAnswers(
  context: StudyContext,
  scope: string,
  answers: AnswerInput[],
): Promise<string> {
  for (const [index, answer] of answers.entries()) {
    try {
      await appendAnswer(context.projectRoot, scope, answer);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${index + 1}번째 응답(${answer.cardId}/${answer.itemId})을 기록하지 못했습니다: ${reason}`);
    }
  }
  return `응답 ${answers.length}건을 기록했습니다.`;
}
