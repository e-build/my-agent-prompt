import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBookInstructions } from "../../src/book/book-instructions.ts";

test("book instructions are the single source for the rebuild rules", async () => {
  const text = await loadBookInstructions();
  assert.match(text, /^# Book rebuild/m);
  for (const rule of [/study_book.*plan/, /개념 단위/, /보강/, /학습자.*원래 답/, /복사하지 않/, /근거/, /배운 곳|record_learned/, /undo/])
    assert.match(text, rule);
});
