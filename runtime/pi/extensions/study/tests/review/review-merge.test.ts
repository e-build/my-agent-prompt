import { test } from "node:test";
import assert from "node:assert/strict";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { loadItem } from "../../src/knowledge/knowledge-store.ts";
import { reviewMergeChanges } from "../../src/review/review-merge.ts";
import { loadSchedule, registerSchedules, saveSchedule } from "../../src/review/review-store.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";

const origin = { projectId: "p-alpha", chapterSlug: "ch-01-intro" };

async function merge(root: string, sourceId: string, targetId: string, changeId = "m1") {
  const s = (await loadItem(root, sourceId))!;
  const t = (await loadItem(root, targetId))!;
  return applyKnowledgeChange(
    root,
    { changeId, operation: "merge", sourceId, targetId, expectedRevisionIds: { [sourceId]: s.revisionId, [targetId]: t.revisionId }, reason: "같음" },
    { extraChanges: (record) => reviewMergeChanges(root, record) },
  );
}

test("merging two scheduled items keeps one active view with the earlier due date and no promoted stage", async (t) => {
  const { root, a, b } = await knowledgeWorkspace(t);
  await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin });
  await registerSchedules(root, { knowledgeIds: [b.id], completedOn: "2026-10-03", origin });
  const sa = (await loadSchedule(root, a.id))!;
  await saveSchedule(root, { ...sa, nextStage: 2, dueDate: "2026-10-20" }, sa);
  await merge(root, b.id, a.id);
  const target = (await loadSchedule(root, a.id))!;
  const source = (await loadSchedule(root, b.id))!;
  assert.equal(target.status, "active");
  assert.equal(target.dueDate, "2026-10-04");
  assert.equal(target.nextStage, 0);
  assert.equal(target.absorbed?.[0].knowledgeId, b.id);
  assert.equal(source.status, "merged");
  assert.equal(source.mergedInto, a.id);
});

test("merging an unscheduled source leaves the target schedule untouched", async (t) => {
  const { root, a, b } = await knowledgeWorkspace(t);
  await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin });
  const before = await loadSchedule(root, a.id);
  await merge(root, b.id, a.id);
  assert.deepEqual(await loadSchedule(root, a.id), before);
});

test("a source-only schedule moves to the canonical target", async (t) => {
  const { root, a, b } = await knowledgeWorkspace(t);
  await registerSchedules(root, { knowledgeIds: [b.id], completedOn: "2026-10-01", origin });
  await merge(root, b.id, a.id);
  const target = (await loadSchedule(root, a.id))!;
  assert.equal(target.dueDate, "2026-10-02");
  assert.equal(target.absorbed?.[0].knowledgeId, b.id);
});

test("unmerge restores both original schedules", async (t) => {
  const { root, a, b } = await knowledgeWorkspace(t);
  await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin });
  await registerSchedules(root, { knowledgeIds: [b.id], completedOn: "2026-10-03", origin });
  const originalA = await loadSchedule(root, a.id);
  const originalB = await loadSchedule(root, b.id);
  await merge(root, b.id, a.id);
  const sa = (await loadItem(root, a.id))!;
  const sb = (await loadItem(root, b.id))!;
  await applyKnowledgeChange(
    root,
    { changeId: "u1", operation: "unmerge", sourceId: b.id, expectedRevisionIds: { [a.id]: sa.revisionId, [b.id]: sb.revisionId }, reason: "조건 다름" },
    { extraChanges: (record) => reviewMergeChanges(root, record) },
  );
  assert.deepEqual(await loadSchedule(root, a.id), originalA);
  assert.deepEqual(await loadSchedule(root, b.id), originalB);
});
