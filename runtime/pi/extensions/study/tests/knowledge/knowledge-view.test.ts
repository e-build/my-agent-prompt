import { test } from "node:test";
import assert from "node:assert/strict";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { buildKnowledgeView, graphScriptHash, renderKnowledgeMap } from "../../src/knowledge/knowledge-view.ts";
import { registerSchedules } from "../../src/review/review-store.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";
import { source } from "../support/knowledge-fixture.ts";
import { treeDigest } from "../support/workspace-fixture.ts";

async function setup(t: any) {
  const ctx = await knowledgeWorkspace(t);
  const make = async (changeId: string, name: string) =>
    (await applyKnowledgeChange(ctx.root, { changeId, operation: "create", reason: "r", item: { name, statement: "SECRET STATEMENT", conditions: [], scope: "", status: "confirmed", explanation: "SECRET EXPLANATION", aliases: [], sources: [source()] } })).items[0];
  const c = await make("kc", "<script>alert(1)</script>");
  const d = await make("kd", "외톨이 지식");
  const refC = { id: c.id, version: c.version, revisionId: c.revisionId };
  await applyKnowledgeChange(ctx.root, { changeId: "ch", operation: "add_chain", reason: "r", chain: { premiseRefs: [ctx.refA, ctx.refB], conclusionRef: refC, sourceRefs: [source()] } });
  await updateBinding(ctx.root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [ctx.refA, refC] }], prerequisites: [{ refId: ctx.a.id, goal: "g", reason: "r" }] });
  await registerSchedules(ctx.root, { knowledgeIds: [ctx.a.id], completedOn: "2026-10-01", origin: { projectId: "p-alpha", chapterSlug: "ch-01-intro" } });
  return { ...ctx, c, d };
}

test("the view is a proposition graph: joint premises meet at an invisible junction, no chapter nodes", async (t) => {
  const { root, a, b, c } = await setup(t);
  const before = await treeDigest(root);
  const view = await buildKnowledgeView(root, { today: "2026-10-05" });
  assert.equal(await treeDigest(root), before);
  assert.ok(view.nodes.every((n) => n.id.startsWith("k-")));
  const j = view.junctions[0];
  assert.deepEqual([...j.premises].sort(), [a.id, b.id].sort());
  assert.equal(j.conclusion, c.id);
  assert.ok(Number.isFinite(view.positions[j.id].x));
  const node = view.nodes.find((n) => n.id === a.id)!;
  assert.equal(node.review?.timing, "overdue");
  assert.deepEqual(node.chapters, ["study-alpha/ch-01-intro"]);
});

test("unconnected knowledge is marked as an orphan on the rim; connected ones form a labelled cluster", async (t) => {
  const { root, a, c, d } = await setup(t);
  const view = await buildKnowledgeView(root, { today: "2026-10-05" });
  assert.ok(view.orphans.includes(d.id));
  assert.ok(!view.orphans.includes(a.id));
  const cluster = view.clusters.find((k) => k.members.includes(c.id))!;
  assert.ok(cluster.members.includes(a.id));
  assert.equal(cluster.label, "study-alpha/ch-01-intro");
});

test("statements, explanations and answers never reach the page", async (t) => {
  const { root } = await setup(t);
  const html = renderKnowledgeMap(await buildKnowledgeView(root, { today: "2026-10-05" }));
  assert.equal(html.includes("SECRET STATEMENT"), false);
  assert.equal(html.includes("SECRET EXPLANATION"), false);
});

test("the page is a self-contained canvas with escaped data and a hash-pinned script", async (t) => {
  const { root, a } = await setup(t);
  const html = renderKnowledgeMap(await buildKnowledgeView(root, { today: "2026-10-05", focus: a.id }));
  assert.match(html, /<canvas/);
  assert.match(html, /<table/);
  assert.match(html, /id="graph-data" type="application\/json"/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /https?:\/\/(?!127\.0\.0\.1)/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|method:\s*"POST"/);
  assert.match(graphScriptHash(), /^sha256-[A-Za-z0-9+/=]+$/);
  assert.match(html, new RegExp(`"focus":"${a.id}"`));
});

test("an empty knowledge base explains how knowledge is created and points to the roadmap", async (t) => {
  const { workspaceFixture } = await import("../support/workspace-fixture.ts");
  const html = renderKnowledgeMap(await buildKnowledgeView(await workspaceFixture(t), { today: "2026-10-05" }));
  assert.match(html, /아직 등록된 공통 지식이 없습니다/);
  assert.match(html, /\/study-map/);
});
