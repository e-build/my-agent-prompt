import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite, type SiteSource } from "../../src/book/site-build.ts";

function source(files: Record<string, string>, tree: SiteSource["tree"] = []): SiteSource {
  return { read: async (path) => files[path] ?? null, bookFiles: Object.keys(files).filter((p) => p.startsWith("book/")), tree };
}

const tree: SiteSource["tree"] = [
  { id: "cn-a", name: "자바", depth: 0, path: "book/자바/README.md" },
  { id: "cn-b", name: "스레드", depth: 1, path: "book/자바/스레드/README.md" },
];

test("book pages become html at the same relative place; links inside the book switch to .html", async () => {
  const site = await buildSite(source({
    "book/README.md": "# 내 교과서\n\n- [자바](%EC%9E%90%EB%B0%94/README.md)",
    "book/자바/README.md": "# 자바\n\n[스레드](%EC%8A%A4%EB%A0%88%EB%93%9C/README.md#core)",
    "book/자바/스레드/README.md": "# 스레드\n\n[위로](../README.md) [밖](https://x.y)",
  }, tree));
  const index = site.pages.get("index.html")!;
  assert.match(index, /<a href="%EC%9E%90%EB%B0%94\/index\.html">자바<\/a>/);
  assert.match(site.pages.get("자바/index.html")!, /href="%EC%8A%A4%EB%A0%88%EB%93%9C\/index\.html#core"/);
  assert.match(site.pages.get("자바/스레드/index.html")!, /href="\.\.\/index\.html"/);
  assert.match(site.pages.get("자바/스레드/index.html")!, /href="https:\/\/x\.y" rel="noopener noreferrer"/);
});

test("every page has CSP, relative assets, the concept tree with the current page marked, and breadcrumbs-free title", async () => {
  const site = await buildSite(source({ "book/README.md": "# 내 교과서", "book/자바/README.md": "# 자바", "book/자바/스레드/README.md": "# 스레드" }, tree));
  const page = site.pages.get("자바/스레드/index.html")!;
  assert.match(page, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'">/);
  assert.match(page, /<link rel="stylesheet" href="\.\.\/\.\.\/_assets\/book\.css">/);
  assert.match(page, /<script src="\.\.\/\.\.\/_assets\/book\.js" defer><\/script>/);
  assert.doesNotMatch(page, /mermaid\.min\.js/, "mermaid is loaded only where needed");
  assert.match(page, /<a href="\.\.\/index\.html">자바<\/a>/);
  assert.match(page, /<a href="index\.html" aria-current="page">스레드<\/a>/);
  assert.match(page, /<title>스레드 · 내 교과서<\/title>/);
  assert.doesNotMatch(page, /<script>/, "no inline scripts");
});

test("links out of the book render the chapter README as a source page, one level deep, never study records", async () => {
  const site = await buildSite(source({
    "book/자바/스레드/README.md": "# 스레드\n\n[ch-01](../../../study-a/ch-01-x/README.md#목표) [기록](../../../study-a/.study/state.json) [리뷰](../../../review/README.md)",
    "study-a/ch-01-x/README.md": "# Ch 01\n\n## 목표\n\n```mermaid\nA-->B\n```\n\n[실습](lab/README.md) [다른 챕터](../ch-02-y/README.md)",
    "study-a/ch-01-x/lab/README.md": "# 실습\n\n[더 깊이](deeper.md)",
    "study-a/ch-01-x/lab/deeper.md": "# deep",
    "study-a/ch-02-y/README.md": "# Ch 02",
  }, tree));
  const book = site.pages.get("자바/스레드/index.html")!;
  assert.match(book, /href="\.\.\/\.\.\/_src\/study-a\/ch-01-x\/README\.html#목표"/);
  assert.doesNotMatch(book, /state\.json|review\/README/);
  const chapter = site.pages.get("_src/study-a/ch-01-x/README.html")!;
  assert.match(chapter, /<pre class="mermaid">A--&gt;B<\/pre>/);
  assert.match(chapter, /<script src="\.\.\/\.\.\/\.\.\/_assets\/mermaid\.min\.js" defer><\/script>/);
  assert.match(chapter, /href="lab\/README\.html"/);
  assert.match(chapter, /href="\.\.\/ch-02-y\/README\.html"/);
  assert.ok(site.pages.has("_src/study-a/ch-01-x/lab/README.html"));
  assert.ok(site.pages.has("_src/study-a/ch-02-y/README.html"));
  assert.ok(!site.pages.has("_src/study-a/ch-01-x/lab/deeper.html"), "source pages are one link deep from the book");
  assert.match(site.pages.get("_src/study-a/ch-01-x/lab/README.html")!, /더 깊이/);
});

test("search index lists book pages with titles and headings only", async () => {
  const site = await buildSite(source({ "book/자바/README.md": "# 자바\n\n## JVM 메모리\n\n본문 SECRET" }, tree));
  const index = JSON.parse(site.searchIndex);
  assert.deepEqual(index, [{ url: "자바/index.html", title: "자바", headings: ["JVM 메모리"] }]);
  assert.doesNotMatch(site.searchIndex, /SECRET/);
});

test("pages that cannot be read are skipped and reported, not fatal", async () => {
  const site = await buildSite({ read: async () => null, bookFiles: ["book/x/README.md"], tree: [] });
  assert.equal(site.pages.size, 0);
  assert.deepEqual(site.warnings, ["읽지 못한 페이지: book/x/README.md"]);
});

test("a link to a markdown file that does not exist stays a plain label, with a warning", async () => {
  const site = await buildSite(source({ "book/자바/README.md": "# 자바\n\n[없는 글](없음.md)" }, tree));
  assert.match(site.pages.get("자바/index.html")!, /<p>없는 글<\/p>/);
  assert.deepEqual(site.warnings, ["깨진 링크: book/자바/README.md → book/자바/없음.md"]);
});

test("local images inside the root are copied into the site; escaping paths and records are refused", async () => {
  const site = await buildSite(source({
    "book/자바/README.md": "# 자바\n\n![구조](../../sources/notion/media/a.png) ![밖](../../../etc/x.png) ![기록](../../study-a/.study/x.png) ![원격](https://ex.com/r.png)",
  }, tree));
  const page = site.pages.get("자바/index.html")!;
  assert.match(page, /<img src="\.\.\/_files\/sources\/notion\/media\/a\.png" alt="구조" loading="lazy">/);
  assert.doesNotMatch(page, /etc\/x\.png|\.study/);
  assert.match(page, /<a href="https:\/\/ex\.com\/r\.png" rel="noopener noreferrer">원격<\/a>/);
  assert.deepEqual(site.files, ["sources/notion/media/a.png"]);
});
