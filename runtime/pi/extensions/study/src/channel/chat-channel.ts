import type { Channel } from "./channel.ts";
import { renderPlain } from "./render-card.ts";

/** Default channel: the agent shows the rendered card in the Pi conversation. */
export function createChatChannel(): Channel {
  return {
    id: "chat",
    available: async () => true,
    deliver: async (card) => ({ ref: `chat:${card.id}`, publicText: renderPlain(card) }),
  };
}
