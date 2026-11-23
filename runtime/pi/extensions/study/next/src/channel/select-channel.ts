import type { Channel, Delivery, LearningCard } from "./channel.ts";

export const CHANNEL_IDS = ["chat", "plannotator"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export function resolveChannelId(settings: { workspace?: string; project?: string }): ChannelId {
  const id = settings.project ?? settings.workspace ?? "chat";
  if (!(CHANNEL_IDS as readonly string[]).includes(id))
    throw new Error(`알 수 없는 학습 채널입니다: ${id} (가능: ${CHANNEL_IDS.join(", ")})`);
  return id as ChannelId;
}

/** Never drops a card silently: a failed primary goes to the fallback and says why. */
export async function deliverWithFallback(
  primary: Channel,
  fallback: Channel,
  card: LearningCard,
): Promise<Delivery> {
  if (primary.id === fallback.id) return primary.deliver(card);
  try {
    return await primary.deliver(card);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const delivery = await fallback.deliver(card);
    return { ...delivery, fallback: `${primary.id} 전송 실패(${reason}) → ${fallback.id}로 보냄` };
  }
}
