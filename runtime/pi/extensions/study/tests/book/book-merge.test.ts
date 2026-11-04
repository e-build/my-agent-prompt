import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBookChange } from "../../src/book/book-changes.ts";
import { bookMergeChanges } from "../../src/book/book-merge.ts";
import { checkBookIntegrity } from "../../src/book/book-integrity.ts";
import { loadConcepts } from "../../src/book/book-store.ts";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { source } from "../support/knowledge-fixture.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

const opts = (root: string) => ({ extraChanges: (record: any) => bookMergeChanges(root, record) });

async function setup(t: any) {
  const root = await workspaceFixture(t);
  const make = async (id: string, name: string) =>
    (await applyKnowledgeChange(root, { changeId: id, operation: "create", reason: "교재", item: { name, statement: `${name} s`, conditions: [], scope: "", status: "confirmed", explanation: "", aliases: [], sources: [source()] } })).items[0];
  const a = await make("k1", "A");
  const b = await make("k2", "B");
  const area = (await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "자바", parentId: null }] })).nodes[0];
  await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [
    { op: "create", key: "p", name: "P", parentId: area.id },
    { op: "create", key: "q", name: "Q", parentId: area.id },
    { op: "place", id: "key:p", knowledgeIds: [a.id] },
  ] });
  const node = async (name: string) => (await loadConcepts(root)).find((n) => n.name === name)!;
  return { root, a, b, node };
}

test("merging a placed proposition into an unplaced one moves the page membership to the target", async (t) => {
  const { root, a, b, node } = await setup(t);
  await applyKnowledgeChange(root, { changeId: "m1", operation: "merge", reason: "같은 명제", sourceId: a.id, targetId: b.id, expectedRevisionIds: { [a.id]: a.revisionId, [b.id]: b.revisionId } }, opts(root));
  assert.deepEqual((await node("P")).members, [b.id]);
  assert.deepEqual(await checkBookIntegrity(root), []);

  const merged = (await loadConcepts(root)).length;
  const items = await Promise.all([a.id, b.id].map(async (id) => (await import("../../src/knowledge/knowledge-store.ts")).requireItem(root, id)));
  await applyKnowledgeChange(root, { changeId: "m2", operation: "unmerge", reason: "다른 명제", sourceId: a.id, expectedRevisionIds: Object.fromEntries(items.map((i) => [i.id, i.revisionId])) }, opts(root));
  assert.deepEqual((await node("P")).members, [a.id]);
  assert.equal((await loadConcepts(root)).length, merged);
});

test("when both sides are placed, the absorbed one is only removed (one page per proposition)", async (t) => {
  const { root, a, b, node } = await setup(t);
  const q = await node("Q");
  await applyBookChange(root, "agent", { changeId: "a2", reason: "x", operations: [{ op: "place", id: q.id, knowledgeIds: [b.id], expectedRevisionId: q.revisionId }] });
  await applyKnowledgeChange(root, { changeId: "m1", operation: "merge", reason: "같은 명제", sourceId: a.id, targetId: b.id, expectedRevisionIds: { [a.id]: a.revisionId, [b.id]: b.revisionId } }, opts(root));
  assert.deepEqual((await node("P")).members, []);
  assert.deepEqual((await node("Q")).members, [b.id]);
  assert.deepEqual(await checkBookIntegrity(root), []);
});

test("relate links two concepts both ways and unrelate removes both directions", async (t) => {
  const { root, node } = await setup(t);
  const [p, q] = [await node("P"), await node("Q")];
  await applyBookChange(root, "agent", { changeId: "r1", reason: "관련", operations: [{ op: "relate", id: p.id, otherId: q.id, expectedRevisionIds: { [p.id]: p.revisionId, [q.id]: q.revisionId } }] });
  assert.deepEqual((await node("P")).related, [q.id]);
  assert.deepEqual((await node("Q")).related, [p.id]);
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  assert.match(await readFile(join(root, "book", "자바", "P", "README.md"), "utf8"), /## 관련 개념\n\n- \[Q\]\(\.\.\/Q\/README\.md\)/);
  const [p2, q2] = [await node("P"), await node("Q")];
  await assert.rejects(applyBookChange(root, "agent", { changeId: "r2", reason: "x", operations: [{ op: "relate", id: p2.id, otherId: p2.id, expectedRevisionIds: { [p2.id]: p2.revisionId } }] }), /자기 자신/);
  await applyBookChange(root, "agent", { changeId: "r3", reason: "해제", operations: [{ op: "unrelate", id: p2.id, otherId: q2.id, expectedRevisionIds: { [p2.id]: p2.revisionId, [q2.id]: q2.revisionId } }] });
  assert.deepEqual((await node("P")).related, []);
  assert.deepEqual((await node("Q")).related, []);
});
