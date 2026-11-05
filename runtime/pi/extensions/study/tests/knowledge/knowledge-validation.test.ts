import { test } from "node:test";
import assert from "node:assert/strict";
import {
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

test("merge redirects must not cycle", () => {
  assert.doesNotThrow(() => validateRedirects(new Map([["k-a", "k-b"], ["k-b", "k-c"]])));
  assert.throws(() => validateRedirects(new Map([["k-a", "k-b"], ["k-b", "k-a"]])), /순환/);
});
