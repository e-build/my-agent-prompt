import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignLabels,
  detectCommunities,
  type LabelRecord,
} from "../../src/knowledge/knowledge-clusters.ts";

/** Two dense triangles joined by one bridge, plus a pair and a loner. */
function sample() {
  const nodes = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4", "p1", "p2", "solo"];
  const edges: Array<[string, string]> = [
    ["a1", "a2"], ["a2", "a3"], ["a1", "a3"], ["a3", "a4"], ["a4", "a1"],
    ["b1", "b2"], ["b2", "b3"], ["b1", "b3"], ["b3", "b4"], ["b4", "b1"],
    ["a3", "b1"],
    ["p1", "p2"],
  ];
  return { nodes, edges };
}

test("dense groups become communities; the bridge does not merge them", () => {
  const { nodes, edges } = sample();
  const communities = detectCommunities(nodes, edges);
  const of = (id: string) => communities.find((c) => c.includes(id));
  assert.deepEqual(of("a1"), ["a1", "a2", "a3", "a4"]);
  assert.deepEqual(of("b2"), ["b1", "b2", "b3", "b4"]);
});

test("communities below the size gate and isolated nodes are not clusters", () => {
  const { nodes, edges } = sample();
  const communities = detectCommunities(nodes, edges, { minSize: 3 });
  assert.ok(!communities.some((c) => c.includes("p1")));
  assert.ok(!communities.some((c) => c.includes("solo")));
});

test("the result is deterministic and independent of input order", () => {
  const { nodes, edges } = sample();
  const once = detectCommunities(nodes, edges);
  const shuffled = detectCommunities([...nodes].reverse(), [...edges].reverse().map(([a, b]) => [b, a] as [string, string]));
  assert.deepEqual(once, shuffled);
});

test("a fully connected chain of three stays one community", () => {
  assert.deepEqual(detectCommunities(["x", "y", "z"], [["x", "y"], ["y", "z"]]), [["x", "y", "z"]]);
});

const record = (id: string, label: string, core: string[]): LabelRecord => ({ id, label, core, at: "2026-11-02T00:00:00.000Z" });

test("a community keeps its label while at least half its members come from the labelled core", () => {
  const records = [record("lab-1", "인터럽트와 종료", ["a", "b", "c", "d"])];
  const out = assignLabels([["a", "b", "c", "x"]], records);
  assert.equal(out[0].label, "인터럽트와 종료");
  assert.equal(out[0].labelId, "lab-1");
  const drifted = assignLabels([["a", "x", "y", "z"]], records);
  assert.equal(drifted[0].label, null);
  assert.equal(drifted[0].labelId, null);
});

test("on a split only the strongest-overlap community inherits the label", () => {
  const records = [record("lab-1", "워커 관리", ["a", "b", "c", "d", "e", "f"])];
  const out = assignLabels([["a", "b", "c", "d"], ["e", "f", "g"]], records);
  assert.equal(out[0].label, "워커 관리");
  assert.equal(out[1].label, null);
});

test("the newest record for the same core wins (relabel appends, history stays)", () => {
  const records = [record("lab-1", "옛 이름", ["a", "b", "c"]), record("lab-2", "새 이름", ["a", "b", "c"])];
  assert.equal(assignLabels([["a", "b", "c"]], records)[0].label, "새 이름");
});
