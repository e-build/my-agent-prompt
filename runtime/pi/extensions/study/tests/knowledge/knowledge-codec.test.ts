import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeKnowledgeItem, encodeKnowledgeItem } from "../../src/knowledge/knowledge-codec.ts";
import { knowledgeItem } from "../support/knowledge-fixture.ts";

test("round-trips metadata and a Markdown explanation with code and comments", () => {
  const item = knowledgeItem({
    explanation:
      "첫 문장. 둘째 문장.\n\n```kotlin\nval x = 1 // <!-- not a marker -->\n```\n\n<!-- user note -->\n끝",
  });
  const encoded = encodeKnowledgeItem(item);
  assert.match(encoded, /^<!-- study:knowledge-meta/);
  assert.deepEqual(decodeKnowledgeItem(encoded), item);
  assert.equal(encodeKnowledgeItem(decodeKnowledgeItem(encoded)), encoded);
});

test("rejects files without the fixed metadata block", () => {
  assert.throws(() => decodeKnowledgeItem("# just markdown"), /메타데이터/);
  assert.throws(
    () => decodeKnowledgeItem("<!-- study:knowledge-meta\n{bad\n-->\n"),
    /메타데이터/,
  );
});
