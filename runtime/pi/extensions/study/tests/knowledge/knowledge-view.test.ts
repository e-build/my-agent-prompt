import { test } from "node:test";
import assert from "node:assert/strict";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { buildKnowledgeView, renderKnowledgeMap } from "../../src/knowledge/knowledge-view.ts";
import { registerSchedules } from "../../src/review/review-store.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";
import { source } from "../support/knowledge-fixture.ts";
import { treeDigest } from "../support/workspace-fixture.ts";

async function setup(t: any) {
  const ctx = await knowledgeWorkspace(t);
  const c = (
    await applyKnowledgeChange(ctx.root, { changeId: "kc", operation: "create", reason: "r", item: { name: "<script>alert(1)</script>", statement: "SECRET STATEMENT", conditions: [], scope: "", status: "confirmed", explanation: "SECRET EXPLANATION", aliases: [], sources: [source()] } })
  ).items[0];
  const refC = { id: c.id, version: c.version, revisionId: c.revisionId };
  await applyKnowledgeChange(ctx.root, { changeId: "ch", operation: "add_chain", reason: "r", chain: { premiseRefs: [ctx.refA, ctx.refB], conclusionRef: refC, sourceRefs: [source()] } });
  await updateBinding(ctx.root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [ctx.refA, refC] }], prerequisites: [{ refId: ctx.a.id, goal: "g", reason: "r" }] });
  await registerSchedules(ctx.root, { knowledgeIds: [ctx.a.id], completedOn: "2026-10-01", origin: { projectId: "p-alpha", chapterSlug: "ch-01-intro" } });
  return { ...ctx, c };
}

test("the view exposes names, relation kinds, joint junctions and scopes but no statements or answers", async (t) => {
  const { root, a, c } = await setup(t);
  const before = await treeDigest(root);
  const view = await buildKnowledgeView(root, { today: "2026-10-05" });
  assert.equal(await treeDigest(root), before);
  assert.ok(view.nodes.some((n) => n.id === a.id && n.review?.timing === "overdue"));
  const junction = view.junctions[0];
  assert.equal(junction.premises.length, 2);
  assert.equal(junction.conclusion, c.id);
  assert.ok(view.edges.some((e) => e.kind === "prerequisite"));
  assert.ok(view.edges.some((e) => e.kind === "context"));
  const json = JSON.stringify(view);
  assert.equal(json.includes("SECRET STATEMENT"), false);
  assert.equal(json.includes("SECRET EXPLANATION"), false);
  assert.equal(json.includes("명제"), false);
});

test("focused views keep only the neighbourhood of the requested item", async (t) => {
  const { root, a } = await setup(t);
  const view = await buildKnowledgeView(root, { focus: a.id, depth: 1, today: "2026-10-05" });
  assert.ok(view.nodes.length >= 1);
  assert.ok(view.nodes.every((n) => n.kind !== "knowledge" || n.distance! <= 1));
});

test("the rendered map escapes injected text and contains an SVG and a table", async (t) => {
  const { root } = await setup(t);
  const html = renderKnowledgeMap(await buildKnowledgeView(root, { today: "2026-10-05" }));
  assert.match(html, /<svg/);
  assert.match(html, /<table/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /https?:\/\/(?!127\.0\.0\.1)/);
  assert.doesNotMatch(html, /fetch\(|method:\s*"POST"/);
});

test("an empty knowledge base explains how knowledge is created and points to the roadmap", async (t) => {
  const { workspaceFixture } = await import("../support/workspace-fixture.ts");
  const html = renderKnowledgeMap(await buildKnowledgeView(await workspaceFixture(t), { today: "2026-10-05" }));
  assert.match(html, /아직 등록된 공통 지식이 없습니다/);
  assert.match(html, /\/study-map/);
});
