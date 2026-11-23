import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverWithFallback, resolveChannelId } from "../../src/channel/select-channel.ts";
import { createChatChannel } from "../../src/channel/chat-channel.ts";
import type { Channel, LearningCard } from "../../src/channel/channel.ts";

const notice: LearningCard = { kind: "notice", id: "c-9", projectSlug: "p", title: "t", body: "b" };

test("project setting wins over the workspace setting, default is chat", () => {
  assert.equal(resolveChannelId({}), "chat");
  assert.equal(resolveChannelId({ workspace: "plannotator" }), "plannotator");
  assert.equal(resolveChannelId({ workspace: "plannotator", project: "chat" }), "chat");
});

test("unknown channel ids are rejected with the known list", () => {
  assert.throws(() => resolveChannelId({ workspace: "slack" }), /slack.*chat, plannotator/);
});

test("a failing channel falls back to chat and says why", async () => {
  const broken: Channel = {
    id: "plannotator",
    available: async () => true,
    deliver: async () => {
      throw new Error("inbox_off");
    },
  };
  const delivery = await deliverWithFallback(broken, createChatChannel(), notice);
  assert.equal(delivery.ref, "chat:c-9");
  assert.match(delivery.fallback!, /plannotator.*inbox_off.*chat/);
});

test("a working channel does not fall back", async () => {
  const delivery = await deliverWithFallback(createChatChannel(), createChatChannel(), notice);
  assert.equal(delivery.fallback, undefined);
});

test("when the fallback is the same channel the error propagates", async () => {
  const broken: Channel = {
    id: "chat",
    available: async () => true,
    deliver: async () => {
      throw new Error("boom");
    },
  };
  await assert.rejects(deliverWithFallback(broken, broken, notice), /boom/);
});
