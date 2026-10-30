import { test } from "node:test";
import assert from "node:assert/strict";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { queryKnowledge } from "../../src/knowledge/knowledge-query.ts";
import { listItemIds, loadAllItems, loadChains } from "../../src/knowledge/knowledge-store.ts";
import { source } from "../support/knowledge-fixture.ts";
import { treeDigest, workspaceFixture } from "../support/workspace-fixture.ts";

const draft = (name: string, statement: string, scope = "Redis") => ({
  name,
  statement,
  conditions: [],
  scope,
  status: "confirmed" as const,
  explanation: "",
  aliases: [],
  sources: [source()],
});

test("empty stores read as empty without creating directories", async (t) => {
  const root = await workspaceFixture(t);
  const before = await treeDigest(root);
  assert.deepEqual(await listItemIds(root), []);
  assert.deepEqual(await loadChains(root), []);
  assert.deepEqual((await queryKnowledge(root)).items, []);
  assert.equal(await treeDigest(root), before);
});

test("same names with different conditions remain separate items", async (t) => {
  const root = await workspaceFixture(t);
  await applyKnowledgeChange(root, { changeId: "c1", operation: "create", reason: "r", item: draft("만료", "TTL 지나면 없음", "Redis") });
  await applyKnowledgeChange(root, { changeId: "c2", operation: "create", reason: "r", item: draft("만료", "만료 이벤트는 지연될 수 있음", "Redis keyspace 알림") });
  assert.equal((await loadAllItems(root)).length, 2);
});

test("summary queries hide statements; full queries are explicit", async (t) => {
  const root = await workspaceFixture(t);
  await applyKnowledgeChange(root, { changeId: "c1", operation: "create", reason: "r", item: draft("만료", "정답 문장") });
  const summary = await queryKnowledge(root, { text: "만료" });
  assert.equal(summary.total, 1);
  assert.equal(JSON.stringify(summary).includes("정답 문장"), false);
  const full = await queryKnowledge(root, { text: "정답", detail: "full" });
  assert.equal((full.items[0] as any).statement, "정답 문장");
});
