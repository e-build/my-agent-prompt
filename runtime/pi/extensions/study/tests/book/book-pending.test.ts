import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyBookChange } from "../../src/book/book-changes.ts";
import { pendingChapters } from "../../src/book/book-pending.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

function state(chapters: Record<string, string>, completions: Record<string, string> = {}) {
  return JSON.stringify({
    version: 1,
    chapters: Object.fromEntries(Object.entries(chapters).map(([slug, status]) => [slug, { test: { status } }])),
    chapterCompletions: Object.fromEntries(Object.entries(completions).map(([slug, completedOn]) => [slug, { completedOn, completedAt: `${completedOn}T00:00:00Z`, source: "test:t1" }])),
  });
}

test("pending chapters are completed chapters not yet recorded in any concept", async (t) => {
  const root = await workspaceFixture(t);
  assert.deepEqual(await pendingChapters(root), []);
  await writeFile(join(root, "study-alpha", ".study", "state.json"), state(
    { "ch-01-intro": "completed", "ch-02-next": "in_progress", "ch-03-legacy": "completed" },
    { "ch-01-intro": "2026-11-03" },
  ));
  assert.deepEqual(await pendingChapters(root), [
    { projectId: "p-alpha", projectSlug: "study-alpha", chapterSlug: "ch-01-intro", completedOn: "2026-11-03" },
    { projectId: "p-alpha", projectSlug: "study-alpha", chapterSlug: "ch-03-legacy", completedOn: null },
  ]);
  const area = (await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "자바", parentId: null }] })).nodes[0];
  await applyBookChange(root, "agent", { changeId: "a1", reason: "정리", operations: [
    { op: "record_learned", id: area.id, expectedRevisionId: area.revisionId, learnedIn: { projectId: "p-alpha", chapterSlug: "ch-01-intro", completedOn: "2026-11-03" } },
  ] });
  assert.deepEqual((await pendingChapters(root)).map((p) => p.chapterSlug), ["ch-03-legacy"]);
});

test("a corrupt project state is skipped, not fatal", async (t) => {
  const root = await workspaceFixture(t);
  await writeFile(join(root, "study-alpha", ".study", "state.json"), "{broken");
  assert.deepEqual(await pendingChapters(root), []);
});
