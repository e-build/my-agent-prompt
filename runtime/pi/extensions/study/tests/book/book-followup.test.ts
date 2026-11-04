import { test } from "node:test";
import assert from "node:assert/strict";
import { bookFollowUp } from "../../src/book/book-followup.ts";

test("follow-up names the chapter, the completion day and carries the rebuild rules", async () => {
  const message = await bookFollowUp({ projectId: "p-alpha", projectSlug: "study-alpha", chapterSlug: "ch-01-intro", completedOn: "2026-11-03" });
  assert.match(message, /^# STUDY_BOOK_PENDING/);
  assert.match(message, /study-alpha · ch-01-intro/);
  assert.match(message, /"projectSlug":"study-alpha","chapterSlug":"ch-01-intro"/);
  assert.match(message, /"projectId":"p-alpha","chapterSlug":"ch-01-intro","completedOn":"2026-11-03"/);
  assert.match(message, /# Book rebuild/);
});

test("a chapter without a recorded completion day asks for today's date instead of guessing", async () => {
  const message = await bookFollowUp({ projectId: "p-alpha", projectSlug: "study-alpha", chapterSlug: "ch-03-legacy", completedOn: null });
  assert.match(message, /완료일 기록 없음/);
  assert.doesNotMatch(message, /"completedOn":"\d/);
});
