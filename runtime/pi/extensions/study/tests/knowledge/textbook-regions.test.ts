import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRegions,
  planRegionRefresh,
  renderRegion,
} from "../../src/knowledge/textbook-regions.ts";
import { knowledgeItem } from "../support/knowledge-fixture.ts";

const a = knowledgeItem({ id: "k-aaaaaaaa", name: "A", statement: "A는 참", explanation: "A 설명" });
const b = knowledgeItem({ id: "k-bbbbbbbb", name: "B", statement: "B는 참", explanation: "B 설명" });

function doc(region: string) {
  return `# Ch 01\n\n개인 메모 — 그대로\n\n${region}\n\n## 프로젝트 예시\n\n예시 본문\n`;
}

test("renders a managed region with refs and a content hash", () => {
  const region = renderRegion("r-ttl", [a, b]);
  assert.match(region, /^<!-- study:knowledge region=r-ttl refs=k-aaaaaaaa@v1,k-bbbbbbbb@v1 hash=[0-9a-f]{12} -->/);
  assert.match(region, /A 설명/);
  assert.match(region, /<!-- \/study:knowledge -->$/);
  const parsed = parseRegions(doc(region));
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].refs.map((r) => r.id), [a.id, b.id]);
  assert.equal(parsed[0].edited, false);
});

test("refresh replaces only unedited managed regions and keeps everything else byte-identical", () => {
  const original = doc(renderRegion("r-ttl", [a]));
  const a2 = { ...a, version: 2, revisionId: "rev-2", explanation: "A 새 설명" };
  const plan = planRegionRefresh(original, new Map([["r-ttl", [a2]]]));
  assert.deepEqual(plan.deferred, []);
  assert.equal(plan.updated.length, 1);
  assert.match(plan.content, /A 새 설명/);
  assert.equal(plan.content.replace(/<!-- study:knowledge[\s\S]*?<!-- \/study:knowledge -->/, "X"), original.replace(/<!-- study:knowledge[\s\S]*?<!-- \/study:knowledge -->/, "X"));
  const again = planRegionRefresh(plan.content, new Map([["r-ttl", [a2]]]));
  assert.equal(again.content, plan.content);
  assert.deepEqual(again.updated, []);
});

test("a directly edited region is deferred with a diff instead of being overwritten", () => {
  const original = doc(renderRegion("r-ttl", [a]));
  const edited = original.replace("A 설명", "A 설명 — 내가 고침");
  const a2 = { ...a, version: 2, revisionId: "rev-2", explanation: "A 새 설명" };
  const plan = planRegionRefresh(edited, new Map([["r-ttl", [a2]]]));
  assert.equal(plan.content, edited);
  assert.equal(plan.deferred.length, 1);
  assert.equal(plan.deferred[0].regionId, "r-ttl");
  assert.match(plan.deferred[0].proposed, /A 새 설명/);
  assert.match(plan.deferred[0].current, /내가 고침/);
});

test("broken or duplicated markers are reported and nothing is changed", () => {
  const region = renderRegion("r-ttl", [a]);
  const broken = doc(region.replace("<!-- /study:knowledge -->", ""));
  assert.throws(() => parseRegions(broken), /닫히지/);
  const dup = doc(`${region}\n\n${region}`);
  assert.throws(() => parseRegions(dup), /중복/);
});

test("uncertain, conflicted or retired items are not rendered as textbook content", () => {
  assert.throws(() => renderRegion("r-x", [{ ...a, status: "uncertain" }]), /확정/);
  const original = doc(renderRegion("r-ttl", [a]));
  const plan = planRegionRefresh(original, new Map([["r-ttl", [{ ...a, version: 2, revisionId: "rev-2", status: "conflicted" }]]]));
  assert.equal(plan.content, original);
  assert.match(plan.blocked[0].reason, /확정/);
});
