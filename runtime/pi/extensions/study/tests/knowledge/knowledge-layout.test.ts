import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutGraph, type LayoutInput } from "../../src/knowledge/knowledge-layout.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function sample(): LayoutInput {
  // Two connected clusters (a-b-c, d-e) plus two orphans; one joint argument (a+b → j → c).
  return {
    nodes: ["k-a", "k-b", "k-c", "k-d", "k-e", "k-o1", "k-o2", "j-1"].map((id) => ({ id, junction: id.startsWith("j-") })),
    edges: [
      { from: "k-a", to: "j-1" },
      { from: "k-b", to: "j-1" },
      { from: "j-1", to: "k-c" },
      { from: "k-d", to: "k-e" },
    ],
  };
}

test("the same input always produces the same layout", () => {
  assert.deepEqual(layoutGraph(sample()).positions, layoutGraph(sample()).positions);
});

test("linked nodes settle closer than unlinked clusters", () => {
  const { positions: p } = layoutGraph(sample());
  assert.ok(dist(p["k-d"], p["k-e"]) < dist(p["k-d"], p["k-a"]));
  assert.ok(dist(p["k-a"], p["j-1"]) < dist(p["k-a"], p["k-e"]));
});

test("orphans sit on a rim outside the connected core", () => {
  const { positions: p, orphans } = layoutGraph(sample());
  assert.deepEqual([...orphans].sort(), ["k-o1", "k-o2"]);
  const connected = ["k-a", "k-b", "k-c", "k-d", "k-e"];
  const cx = connected.reduce((s, id) => s + p[id].x, 0) / connected.length;
  const cy = connected.reduce((s, id) => s + p[id].y, 0) / connected.length;
  const coreMax = Math.max(...connected.map((id) => Math.hypot(p[id].x - cx, p[id].y - cy)));
  for (const id of orphans) assert.ok(Math.hypot(p[id].x - cx, p[id].y - cy) > coreMax, id);
});

test("previous positions are kept when the graph grows", () => {
  const first = layoutGraph(sample());
  const grown = sample();
  grown.nodes.push({ id: "k-f", junction: false });
  grown.edges.push({ from: "k-e", to: "k-f" });
  const second = layoutGraph(grown, first.positions);
  for (const id of ["k-a", "k-b", "k-c", "k-d", "k-e"]) assert.ok(dist(first.positions[id], second.positions[id]) < 15, id);
  assert.ok(dist(second.positions["k-f"], second.positions["k-e"]) < dist(second.positions["k-f"], second.positions["k-a"]));
});

test("an orphan that gets connected leaves the rim", () => {
  const first = layoutGraph(sample());
  const linked = sample();
  linked.edges.push({ from: "k-o1", to: "k-d" });
  const second = layoutGraph(linked, first.positions);
  assert.ok(!second.orphans.includes("k-o1"));
  assert.ok(dist(second.positions["k-o1"], second.positions["k-d"]) < dist(first.positions["k-o1"], first.positions["k-d"]));
});

test("empty and single-node graphs are handled", () => {
  assert.deepEqual(layoutGraph({ nodes: [], edges: [] }).positions, {});
  const one = layoutGraph({ nodes: [{ id: "k-x", junction: false }], edges: [] });
  assert.ok(Number.isFinite(one.positions["k-x"].x));
});
