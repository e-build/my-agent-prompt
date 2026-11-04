import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDiff, renderChangePage } from "../../src/book/book-diff.ts";

test("line diff keeps order and marks additions and deletions, collapsing long unchanged runs", () => {
  const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].join("\n");
  const after = ["a", "B", "c", "d", "e", "f", "g", "h", "i", "j", "k"].join("\n");
  const ops = lineDiff(before, after);
  assert.deepEqual(ops.filter((o) => o.kind !== "same").map((o) => [o.kind, o.text]), [["del", "b"], ["add", "B"], ["add", "k"]]);
  const html = renderChangePage({ changeId: "a1", reason: "보강 <x>", at: "2026-11-04T01:00:00Z", files: [{ path: "book/자바/README.md", before, after }] });
  assert.match(html, /<h1>교과서 변경 a1<\/h1>/);
  assert.match(html, /보강 &lt;x&gt;/);
  assert.match(html, /<div class="del">- b<\/div>\n<div class="add">\+ B<\/div>/);
  assert.match(html, /<div class="gap">… 같은 줄 \d+개 …<\/div>/);
});

test("created and removed files show whole-file additions or deletions; non-page files are listed only", () => {
  const html = renderChangePage({ changeId: "a2", reason: "r", at: "2026-11-04T01:00:00Z", files: [
    { path: "book/새/README.md", before: null, after: "x\ny" },
    { path: "book/옛/README.md", before: "z", after: null },
    { path: "knowledge/concepts/cn-1.json", before: "{}", after: "{\"a\":1}" },
  ] });
  assert.match(html, /<h2>book\/새\/README\.md <small>새로 씀<\/small><\/h2>[\s\S]*<div class="add">\+ x<\/div>/);
  assert.match(html, /<h2>book\/옛\/README\.md <small>지움<\/small><\/h2>[\s\S]*<div class="del">- z<\/div>/);
  assert.match(html, /<li>knowledge\/concepts\/cn-1\.json<\/li>/);
  assert.doesNotMatch(html, /&quot;a&quot;:1/);
});

test("page comparisons ignore front matter and managed-region markers so only readable text differs", () => {
  const page = (body: string, hash: string) => `---\nconcept: cn-aaaa1111\n---\n<!-- study:book region=main hash=${hash} -->\n${body}\n<!-- /study:book -->\n`;
  const html = renderChangePage({ changeId: "a3", reason: "r", at: "2026-11-04T01:00:00Z", files: [{ path: "book/a/README.md", before: page("옛 본문", "000000000000"), after: page("새 본문", "111111111111") }] });
  assert.match(html, /<div class="del">- 옛 본문<\/div>\n<div class="add">\+ 새 본문<\/div>/);
  assert.doesNotMatch(html, /hash=|concept:/);
});
