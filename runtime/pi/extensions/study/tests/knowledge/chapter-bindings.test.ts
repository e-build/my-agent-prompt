import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadBinding,
  updateBinding,
} from "../../src/knowledge/chapter-bindings.ts";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { refreshTextbook } from "../../src/knowledge/textbook-refresh.ts";
import { source } from "../support/knowledge-fixture.ts";
import { treeDigest, workspaceFixture } from "../support/workspace-fixture.ts";

async function setup(t: any) {
  const root = await workspaceFixture(t);
  const { items: [item] } = await applyKnowledgeChange(root, {
    changeId: "c1",
    operation: "create",
    reason: "교재",
    item: { name: "TTL", statement: "TTL 지나면 없음", conditions: [], scope: "Redis", status: "confirmed", explanation: "TTL 설명", aliases: [], sources: [source()] },
  });
  return { root, item };
}

test("binding stores shared refs, local context and prerequisite route separately", async (t) => {
  const { root, item } = await setup(t);
  assert.equal(await loadBinding(root, "study-alpha", "ch-01-intro"), null);
  const binding = await updateBinding(root, "study-alpha", "ch-01-intro", {
    expectedRevision: null,
    regions: [{ regionId: "r-ttl", refs: [{ id: item.id, version: 1, revisionId: item.revisionId }] }],
    contexts: [{ refId: item.id, note: "캐시 만료 실습" }],
    prerequisites: [{ refId: item.id, goal: "read-through 이해", reason: "만료를 먼저 알아야 함" }],
    uncertain: ["만료 이벤트 지연 범위"],
  });
  assert.equal(binding.projectId, "p-alpha");
  assert.equal(binding.revision, 1);
  const loaded = await loadBinding(root, "study-alpha", "ch-01-intro");
  assert.deepEqual(loaded, binding);
  await assert.rejects(
    updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: 0, regions: [] }),
    /다른 변경/,
  );
  await assert.rejects(updateBinding(root, "study-alpha", "../x", { expectedRevision: null, regions: [] }), /챕터/);
});

test("refresh inserts a region only with explicit placement and preserves notes", async (t) => {
  const { root, item } = await setup(t);
  await updateBinding(root, "study-alpha", "ch-01-intro", {
    expectedRevision: null,
    regions: [{ regionId: "r-ttl", refs: [{ id: item.id, version: 1, revisionId: item.revisionId }] }],
  });
  const readme = join(root, "study-alpha", "ch-01-intro", "README.md");
  await writeFile(readme, "# Ch 01\n\n## 개념 학습 노트\n\n내 메모\n");
  const before = await treeDigest(root);
  const preview = await refreshTextbook(root, "study-alpha", "ch-01-intro", { apply: false });
  assert.equal(await treeDigest(root), before);
  assert.deepEqual(preview.missing, ["r-ttl"]);

  const inserted = await refreshTextbook(root, "study-alpha", "ch-01-intro", { apply: true, insertMissingAfterHeading: "## 개념 학습 노트" });
  assert.deepEqual(inserted.inserted, ["r-ttl"]);
  const content = await readFile(readme, "utf8");
  assert.match(content, /내 메모/);
  assert.match(content, /TTL 설명/);

  const next = (await import("../../src/knowledge/knowledge-store.ts")).loadItem;
  const current = (await next(root, item.id))!;
  await applyKnowledgeChange(root, { changeId: "c2", operation: "revise", id: item.id, expectedRevisionId: current.revisionId, reason: "정밀화", patch: { explanation: "TTL 새 설명" } });
  const refreshed = await refreshTextbook(root, "study-alpha", "ch-01-intro", { apply: true });
  assert.deepEqual(refreshed.updated, ["r-ttl"]);
  assert.match(await readFile(readme, "utf8"), /TTL 새 설명/);
  assert.match(await readFile(readme, "utf8"), /내 메모/);

  await writeFile(readme, (await readFile(readme, "utf8")).replace("TTL 새 설명", "TTL 새 설명 (내가 고침)"));
  const latest = (await next(root, item.id))!;
  await applyKnowledgeChange(root, { changeId: "c3", operation: "revise", id: item.id, expectedRevisionId: latest.revisionId, reason: "r", patch: { explanation: "세 번째" } });
  const deferred = await refreshTextbook(root, "study-alpha", "ch-01-intro", { apply: true });
  assert.equal(deferred.deferred.length, 1);
  assert.match(await readFile(readme, "utf8"), /내가 고침/);
});
