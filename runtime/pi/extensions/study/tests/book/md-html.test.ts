import { test } from "node:test";
import assert from "node:assert/strict";
import { headingSlug, renderMarkdown } from "../../src/book/md-html.ts";
import { highlight } from "../../src/book/highlight.ts";

test("everything is escaped; raw HTML and script never become markup", () => {
  const html = renderMarkdown("<script>alert(1)</script> & \"q\"\n\n`<b>`").html;
  assert.equal(html, "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;</p>\n<p><code>&lt;b&gt;</code></p>");
});

test("unsafe link schemes render as text; safe ones are rewritten by the caller", () => {
  const { html } = renderMarkdown("[x](javascript:alert(1)) [y](https://a.b/?q=1&r=2) [z](../a.md#b)", {
    rewriteLink: (href) => (href.endsWith(".md#b") ? "../a.html#b" : href),
  });
  assert.match(html, /^<p>x <a href="https:\/\/a\.b\/\?q=1&amp;r=2" rel="noopener noreferrer">y<\/a> <a href="\.\.\/a\.html#b">z<\/a><\/p>$/);
});

test("headings get GitHub-style anchors (Korean kept, punctuation dropped, duplicates numbered) and a toc", () => {
  const { html, toc } = renderMarkdown("# Ch 01 — 스레드\n## 학습 목표\n## 학습 목표\n### `join()`과 대기");
  assert.match(html, /<h1 id="ch-01--스레드">/);
  assert.match(html, /<h2 id="학습-목표">학습 목표<\/h2>\n<h2 id="학습-목표-1">/);
  assert.match(html, /<h3 id="join과-대기"><code>join\(\)<\/code>과 대기<\/h3>/);
  assert.deepEqual(toc.map((t) => [t.level, t.id]), [[1, "ch-01--스레드"], [2, "학습-목표"], [2, "학습-목표-1"], [3, "join과-대기"]]);
  assert.equal(headingSlug("A/B: C?"), "ab-c");
});

test("lists, tasks, quotes, tables and rules", () => {
  const { html } = renderMarkdown("3. a\n4. b\n\n- [x] done\n  - sub\n\n> q\n\n| h | n |\n|:-|-:|\n| a | 1 |\n\n---");
  assert.match(html, /<ol start="3"><li><p>a<\/p><\/li><li><p>b<\/p><\/li><\/ol>/);
  assert.match(html, /<li class="task"><input type="checkbox" disabled checked> <p>done<\/p><ul><li><p>sub<\/p><\/li><\/ul><\/li>/);
  assert.match(html, /<blockquote><p>q<\/p><\/blockquote>/);
  assert.match(html, /<table><thead><tr><th style="text-align:left">h<\/th><th style="text-align:right">n<\/th><\/tr><\/thead><tbody><tr><td style="text-align:left">a<\/td><td style="text-align:right">1<\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<hr>$/);
});

test("mermaid stays text inside a marked pre; code gets language classes and highlighting", () => {
  const { html, mermaid } = renderMarkdown("```mermaid\nA-->B<script>\n```\n\n```java\n// c\nint x = \"s\";\n```");
  assert.equal(mermaid, 1);
  assert.match(html, /<pre class="mermaid">A--&gt;B&lt;script&gt;<\/pre>/);
  assert.match(html, /<pre><code class="language-java"><span class="tok-com">\/\/ c<\/span>\n<span class="tok-kw">int<\/span> x = <span class="tok-str">&quot;s&quot;<\/span>;<\/code><\/pre>/);
});

test("highlight covers keywords, strings, comments and numbers per language and escapes everything", () => {
  assert.equal(highlight("SELECT 1 -- x", "sql"), '<span class="tok-kw">SELECT</span> <span class="tok-num">1</span> <span class="tok-com">-- x</span>');
  assert.equal(highlight("echo '<a>' # c", "sh"), '<span class="tok-kw">echo</span> <span class="tok-str">&#39;&lt;a&gt;&#39;</span> <span class="tok-com"># c</span>');
  assert.equal(highlight("fun f() = /* x */ 2", "kotlin"), '<span class="tok-kw">fun</span> f() = <span class="tok-com">/* x */</span> <span class="tok-num">2</span>');
  assert.equal(highlight("<x>", "unknown"), "&lt;x&gt;");
});
