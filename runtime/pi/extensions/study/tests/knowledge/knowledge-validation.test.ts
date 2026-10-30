import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chainPremiseKey,
  validateChain,
  validateChains,
  validateKnowledgeItem,
  validateRedirects,
} from "../../src/knowledge/knowledge-validation.ts";
import { knowledgeItem, source } from "../support/knowledge-fixture.ts";

test("confirmed items need sources; uncertain items may omit them", () => {
  assert.throws(() => validateKnowledgeItem(knowledgeItem({ sources: [] })), /출처/);
  assert.equal(validateKnowledgeItem(knowledgeItem({ sources: [], status: "uncertain" })).status, "uncertain");
  assert.throws(
    () => validateKnowledgeItem(knowledgeItem({ sources: [source({ basis: "hypothesis" })] })),
    /가설/,
  );
});

test("rejects unsafe IDs, unknown fields and oversized content", () => {
  assert.throws(() => validateKnowledgeItem(knowledgeItem({ id: "../k-x" })), /ID/);
  assert.throws(() => validateKnowledgeItem({ ...knowledgeItem(), extra: 1 } as any), /알 수 없는 필드/);
  assert.throws(() => validateKnowledgeItem(knowledgeItem({ statement: "x".repeat(5001) })), /길이/);
  assert.throws(() => validateKnowledgeItem(knowledgeItem({ version: 0 })), /version/);
  assert.throws(() => validateKnowledgeItem(knowledgeItem({ statement: " " })), /statement/);
  assert.throws(
    () => validateKnowledgeItem(knowledgeItem({ sources: [source({ kind: "learner" as any })] })),
    /kind/,
  );
});

const ref = (id: string) => ({ id, version: 1, revisionId: `rev-${id}` });

test("joint premises are a set distinct from a single premise", () => {
  const joint = { id: "c-1", premiseRefs: [ref("k-aaaa"), ref("k-bbbb")], conclusionRef: ref("k-cccc"), sourceRefs: [source()], revisionId: "r" };
  const reversed = { ...joint, id: "c-2", premiseRefs: [ref("k-bbbb"), ref("k-aaaa")] };
  const single = { ...joint, id: "c-3", premiseRefs: [ref("k-aaaa")] };
  const other = { ...joint, id: "c-4", premiseRefs: [ref("k-dddd")] };
  assert.equal(chainPremiseKey(joint), chainPremiseKey(reversed));
  assert.notEqual(chainPremiseKey(joint), chainPremiseKey(single));
  assert.throws(() => validateChains([joint, reversed]), /같은 전제 묶음/);
  assert.equal(validateChains([joint, single, other]).length, 3);
});

test("rejects self inference, empty premises and chains without sources", () => {
  const base = { id: "c-1", premiseRefs: [ref("k-aaaa")], conclusionRef: ref("k-cccc"), sourceRefs: [source()], revisionId: "r" };
  assert.throws(() => validateChain({ ...base, conclusionRef: ref("k-aaaa") }), /자기 자신/);
  assert.throws(() => validateChain({ ...base, premiseRefs: [] }), /전제/);
  assert.throws(() => validateChain({ ...base, sourceRefs: [] }), /근거/);
  assert.throws(() => validateChain({ ...base, premiseRefs: [ref("k-aaaa"), ref("k-aaaa")] }), /중복/);
});

test("merge redirects must not cycle", () => {
  assert.doesNotThrow(() => validateRedirects(new Map([["k-a", "k-b"], ["k-b", "k-c"]])));
  assert.throws(() => validateRedirects(new Map([["k-a", "k-b"], ["k-b", "k-a"]])), /순환/);
});
