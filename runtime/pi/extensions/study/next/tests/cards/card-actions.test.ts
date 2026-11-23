import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ask, recordAnswers, send } from "../../src/cards/card-actions.ts";
import { readScope } from "../../src/cards/card-store.ts";
import type { Channel, LearningCard } from "../../src/channel/channel.ts";
import { createChatChannel } from "../../src/channel/chat-channel.ts";
import type { StudyContext } from "../../src/channel/channel-context.ts";

async function context(channelId: "chat" | "plannotator" = "chat"): Promise<StudyContext> {
  const projectRoot = join(await mkdtemp(join(tmpdir(), "ca-")), "study-x");
  await mkdir(join(projectRoot, "ch-01-a", "concepts"), { recursive: true });
  await writeFile(join(projectRoot, "ch-01-a", "concepts", "01-a.md"), "# a");
  return { projectRoot, projectSlug: "study-x", workspace: null, channelId };
}

function recordingChannel(order: string[], fail = false, id = "plannotator"): Channel {
  return {
    id,
    available: async () => true,
    deliver: async (card) => {
      order.push(`deliver:${card.id}`);
      if (fail) throw new Error("inbox_off");
      return { ref: `${id}:m1`, publicText: `Q(${card.id})` };
    },
  };
}

const question = {
  kind: "question",
  chapterSlug: "ch-01-a",
  purpose: "concept-check",
  askConfidence: true,
  items: [{ id: "q1", prompt: "NULL = NULL?" }],
};
const criteria = { q1: { answer: "UNKNOWN", rubric: "UNKNOWN이라고 답하면 정답" } };

test("ask stores criteria before the channel is called and returns the card id", async () => {
  const ctx = await context("plannotator");
  const order: string[] = [];
  const result = await ask(ctx, { card: { ...question, id: "c-1" }, criteria }, {
    primary: recordingChannel(order),
    fallback: createChatChannel(),
    beforeDeliver: async () => {
      order.push(
        `criteria:${(await readScope(ctx.projectRoot, "ch-01-a")).cards["c-1"] ? "saved" : "missing"}`,
      );
    },
  });
  assert.deepEqual(order, ["criteria:saved", "deliver:c-1"]);
  assert.equal(result.cardId, "c-1");
  assert.equal((await readScope(ctx.projectRoot, "ch-01-a")).cards["c-1"].status, "delivered");
});

test("ask generates an id and fills the project slug", async () => {
  const ctx = await context();
  const result = await ask(ctx, { card: question, criteria }, {
    primary: createChatChannel(),
    fallback: createChatChannel(),
  });
  assert.match(result.cardId, /^c-[a-z0-9]{8}$/);
  const stored = (await readScope(ctx.projectRoot, "ch-01-a")).cards[result.cardId];
  assert.equal(stored.card.projectSlug, "study-x");
});

test("chat delivery tells the agent to show the question verbatim", async () => {
  const ctx = await context();
  const result = await ask(ctx, { card: { ...question, id: "c-2" }, criteria }, {
    primary: createChatChannel(),
    fallback: createChatChannel(),
  });
  assert.match(result.message, /그대로 보여 주세요/);
  assert.match(result.message, /NULL = NULL\?/);
});

test("plannotator delivery tells the agent not to repeat the question in chat", async () => {
  const ctx = await context("plannotator");
  const result = await ask(ctx, { card: { ...question, id: "c-3" }, criteria }, {
    primary: recordingChannel([]),
    fallback: createChatChannel(),
  });
  assert.match(result.message, /채팅에 질문을 다시 쓰지 마세요/);
  assert.doesNotMatch(result.message, /Q\(c-3\)/);
});

test("a failed primary falls back to chat, says so, and keeps criteria hidden", async () => {
  const ctx = await context("plannotator");
  const result = await ask(ctx, { card: { ...question, id: "c-4" }, criteria }, {
    primary: recordingChannel([], true),
    fallback: createChatChannel(),
  });
  assert.match(result.message, /fallback: plannotator 전송 실패\(inbox_off\)/);
  assert.match(result.message, /그대로 보여 주세요/);
  assert.doesNotMatch(result.message, /UNKNOWN이라고 답하면/);
});

test("when every channel fails the card stays undelivered and the error surfaces", async () => {
  const ctx = await context();
  const broken = recordingChannel([], true, "chat");
  await assert.rejects(
    ask(ctx, { card: { ...question, id: "c-5" }, criteria }, { primary: broken, fallback: broken }),
    /inbox_off/,
  );
  assert.equal((await readScope(ctx.projectRoot, "ch-01-a")).cards["c-5"].status, "undelivered");
});

test("ask rejects non-question cards and project mismatches", async () => {
  const ctx = await context();
  const channels = { primary: createChatChannel(), fallback: createChatChannel() };
  await assert.rejects(
    ask(ctx, { card: { kind: "notice", title: "t", body: "b" } as never, criteria }, channels),
    /question/,
  );
  await assert.rejects(
    ask(ctx, { card: { ...question, projectSlug: "study-other" }, criteria }, channels),
    /study-other/,
  );
});

test("send makes lesson attachments absolute and refuses paths outside the project", async () => {
  const ctx = await context("plannotator");
  const seen: LearningCard[] = [];
  const channel: Channel = {
    id: "plannotator",
    available: async () => true,
    deliver: async (card) => {
      seen.push(card);
      return { ref: "plannotator:m", publicText: "x" };
    },
  };
  const lesson = {
    kind: "lesson",
    chapterSlug: "ch-01-a",
    title: "a",
    summary: "s",
    attachments: ["ch-01-a/concepts/01-a.md"],
  };
  await send(ctx, { card: lesson }, { primary: channel, fallback: createChatChannel() });
  assert.deepEqual(
    (seen[0] as { attachments: string[] }).attachments,
    [join(ctx.projectRoot, "ch-01-a", "concepts", "01-a.md")],
  );
  await assert.rejects(
    send(ctx, { card: { ...lesson, attachments: ["../../etc/passwd"] } }, {
      primary: channel,
      fallback: createChatChannel(),
    }),
    /프로젝트 밖/,
  );
  await assert.rejects(
    send(ctx, { card: { ...lesson, attachments: ["ch-01-a/concepts/missing.md"] } }, {
      primary: channel,
      fallback: createChatChannel(),
    }),
    /missing\.md/,
  );
});

test("send refuses question cards", async () => {
  const ctx = await context();
  await assert.rejects(
    send(ctx, { card: question as never }, { primary: createChatChannel(), fallback: createChatChannel() }),
    /study_ask/,
  );
});

test("recordAnswers appends each answer and reports per-item results", async () => {
  const ctx = await context();
  await ask(ctx, { card: { ...question, id: "c-6" }, criteria }, {
    primary: createChatChannel(),
    fallback: createChatChannel(),
  });
  const message = await recordAnswers(ctx, "ch-01-a", [
    { cardId: "c-6", itemId: "q1", response: "UNKNOWN", assistance: "independent", result: "demonstrated", reason: "정답" },
    { cardId: "c-6", itemId: "confidence", response: "8", assistance: "independent", result: "unverified", reason: "확신도" },
  ]);
  assert.match(message, /2건/);
  assert.equal((await readScope(ctx.projectRoot, "ch-01-a")).answers.length, 2);
});

test("recordAnswers stops at the first invalid answer and says which one", async () => {
  const ctx = await context();
  await ask(ctx, { card: { ...question, id: "c-7" }, criteria }, {
    primary: createChatChannel(),
    fallback: createChatChannel(),
  });
  await assert.rejects(
    recordAnswers(ctx, "ch-01-a", [
      { cardId: "c-7", itemId: "q1", response: "x", assistance: "independent", result: "incorrect", reason: "" },
      { cardId: "c-7", itemId: "q9", response: "x", assistance: "independent", result: "incorrect", reason: "" },
    ]),
    /2번째.*q9/,
  );
  assert.equal((await readScope(ctx.projectRoot, "ch-01-a")).answers.length, 1);
});
