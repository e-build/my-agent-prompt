import { test } from "node:test";
import assert from "node:assert/strict";
import { createChatChannel } from "../../src/channel/chat-channel.ts";
import type { LearningCard } from "../../src/channel/channel.ts";

const question: LearningCard = {
  kind: "question",
  id: "c-1",
  projectSlug: "p",
  chapterSlug: "ch-01-a",
  purpose: "test",
  askConfidence: true,
  items: [
    { id: "q1", prompt: "NULL = NULL의 결과는?", choices: ["TRUE", "FALSE", "UNKNOWN"] },
    { id: "q2", prompt: "COUNT(col)과 COUNT(*)의 차이를 설명하세요." },
  ],
};

test("chat channel renders every item with its marker and asks confidence once", async () => {
  const { ref, publicText } = await createChatChannel().deliver(question);
  assert.equal(ref, "chat:c-1");
  assert.match(publicText, /NULL = NULL의 결과는\?\*\* \[c-1\/q1\]/);
  assert.match(publicText, /- TRUE/);
  assert.match(publicText, /\[c-1\/q2\]/);
  assert.equal(publicText.match(/확신도\(0~10\)/g)?.length, 1);
});

test("chat channel is always available", async () => {
  assert.equal(await createChatChannel().available(), true);
});

test("lesson cards list their attachments", async () => {
  const { publicText } = await createChatChannel().deliver({
    kind: "lesson",
    id: "c-2",
    projectSlug: "p",
    chapterSlug: "ch-01-a",
    title: "3값 논리",
    summary: "UNKNOWN이 생기는 이유",
    attachments: ["ch-01-a/concepts/01-three-valued.md"],
  });
  assert.match(publicText, /3값 논리/);
  assert.match(publicText, /ch-01-a\/concepts\/01-three-valued\.md/);
});

test("notice cards show title and body", async () => {
  const { publicText } = await createChatChannel().deliver({
    kind: "notice",
    id: "c-3",
    projectSlug: "p",
    title: "시험 결과",
    body: "4/5 통과",
  });
  assert.equal(publicText, "### 시험 결과\n\n4/5 통과");
});
