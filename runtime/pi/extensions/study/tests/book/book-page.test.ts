import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConceptName, validateConceptNode } from "../../src/book/book-types.ts";
import { conceptNode } from "./book-fixture.ts";

test("concept names are NFC directory names without path characters", () => {
  assert.equal(normalizeConceptName("인터럽트".normalize("NFD")), "인터럽트");
  for (const bad of ["a/b", "..", ".hidden", "README.md", "", "x".repeat(61), "a:b"])
    assert.throws(() => normalizeConceptName(bad));
  assert.throws(() => validateConceptNode(conceptNode({ owner: "agent", parentId: null })), /사용자 소유/);
  assert.throws(() => validateConceptNode({ ...conceptNode(), extra: 1 } as any), /알 수 없는/);
});
