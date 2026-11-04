import { test } from "node:test";
import assert from "node:assert/strict";
import { notionToMarkdown } from "../../src/book/notion-md.ts";

const md = (src: string, opts = {}) => notionToMarkdown(src, { pageTitle: (id) => (id === "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ? "하위 페이지" : null), ...opts });

test("inline tags become markdown; colours and underline drop to plain emphasis", () => {
  const r = md('<b>굵게</b> <i>기울임</i> <s>취소</s> <u>밑줄</u> <span color="red">빨강</span> <b><span color="red">강조</span></b>');
  assert.equal(r.markdown, "**굵게** *기울임* ~~취소~~ 밑줄 빨강 **강조**");
});

test("code fences and inline code are copied verbatim, even when they contain tag-like text", () => {
  const src = "```xml\n<web-app>\n  <servlet/>\n</web-app>\n```\n\n`<b>` 와 <code><out E></code>";
  const r = md(src);
  assert.match(r.markdown, /^```xml\n<web-app>\n  <servlet\/>\n<\/web-app>\n```/);
  assert.match(r.markdown, /`<b>` 와 `<out E>`/);
});

test("indented fences inside list items keep the list indentation", () => {
  const r = md("1. 설정\n   ```xml\n   <a/>\n   ```\n2. 다음");
  assert.equal(r.markdown, "1. 설정\n   ```xml\n   <a/>\n   ```\n2. 다음");
});

test("toggles open into a bold summary line plus their children; toggle headings become headings", () => {
  const r = md('<toggle>\n요약 줄\n\n- 자식\n</toggle>\n\n<toggle heading="h2">\n소제목\n\n본문\n</toggle>');
  assert.equal(r.markdown, "**요약 줄**\n\n- 자식\n\n## 소제목\n\n본문");
});

test("callouts and quote blocks become blockquotes; <br /> becomes a line break inside them", () => {
  const r = md('<callout icon="💡" color="gray_bg">\n첫 줄<br />둘째 줄\n</callout>\n\n<quote>\n인용\n</quote>');
  assert.equal(r.markdown, "> 💡 첫 줄\n> 둘째 줄\n\n> 인용");
});

test("block containers <p>, <h3>, html lists and columns unwrap to plain blocks", () => {
  const r = md('<p>\n문단\n</p>\n\n<h3>\ncut \n</h3>\n\n<ul>\n<li>\n하나\n</li>\n<li color="red">\n둘\n</li>\n</ul>\n\n<columns>\n<column ratio="50">\n왼쪽\n</column>\n<column ratio="50">\n오른쪽\n</column>\n</columns>');
  assert.equal(r.markdown, "문단\n\n### cut\n\n- 하나\n- 둘\n\n왼쪽\n\n오른쪽");
});

test("html tables become pipe tables with escaped pipes and <br /> kept as a space", () => {
  const src = '<table header-row="true">\n<colgroup>\n<col />\n</colgroup>\n<tr>\n<td>\n이름\n</td>\n<td>\n설명\n</td>\n</tr>\n<tr>\n<td>\na|b\n</td>\n<td>\n<b>굵게</b><br />다음\n</td>\n</tr>\n</table>';
  assert.equal(md(src).markdown, "| 이름 | 설명 |\n|---|---|\n| a\\|b | **굵게** 다음 |");
});

test("a table without a header row gets an empty header so it stays a table", () => {
  const src = "<table>\n<tr>\n<td>\na\n</td>\n<td>\nb\n</td>\n</tr>\n</table>";
  assert.equal(md(src).markdown, "|  |  |\n|---|---|\n| a | b |");
});

test("images are collected and replaced by local paths; bookmarks, link previews and embeds become links", () => {
  const src = '<image source="notion-file-block://b1/f1?space_id=s&amp;name=a%2520b.png" />\n\n<image source="https://ex.com/x.png">캡션</image>\n\n<bookmark source="https://blog.ex/1" />\n\n<link-preview url="https://app.notion.com/p/x#y" source="https://github.com/a/b" />\n\n<embed source="https://youtu.be/z" />';
  const r = md(src, { imagePath: (ref: string, i: number) => `media/${i}.png` });
  assert.equal(r.markdown, "![](media/0.png)\n\n![캡션](https://ex.com/x.png)\n\n[https://blog.ex/1](https://blog.ex/1)\n\n[https://github.com/a/b](https://github.com/a/b)\n\n[https://youtu.be/z](https://youtu.be/z)");
  assert.deepEqual(r.images, [{ ref: "notion-file-block://b1/f1?space_id=s&name=a%2520b.png", path: "media/0.png" }]);
});

test("sub pages and mentions become links to the converted page; unknown pages keep the Notion URL", () => {
  const src = '<page url="https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">\n제목\n</page>\n\n<page url="https://app.notion.com/p/ffffffffffffffffffffffffffffffff">\n모름\n</page>\n\n본문 <mention url="https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" /> 끝';
  const r = md(src, { pageLink: (id: string) => (id === "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ? "../하위.md" : null) });
  assert.equal(r.markdown, "- [제목](../하위.md)\n\n- [모름](https://app.notion.com/p/ffffffffffffffffffffffffffffffff)\n\n본문 [하위 페이지](../하위.md) 끝");
  assert.deepEqual(r.childPages, ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "ffffffffffffffffffffffffffffffff"]);
});

test("notion-only markers are dropped or reported, never leaked as raw tags", () => {
  const src = '<table-of-contents color="gray_bg" />\n\n<p />\n\n<unknown url="https://app.notion.com/p/x#y" alt="alias" />\n\n<database url="https://app.notion.com/p/d1" data-source-url="collection://c1" inline="true">서적</database>\n\n<synced-block-reference url="https://app.notion.com/p/s#t" notice="n">\n공유 본문\n</synced-block-reference>';
  const r = md(src);
  assert.equal(r.markdown, "> 노션 데이터베이스: 서적 (collection://c1)\n\n공유 본문");
  assert.deepEqual(r.databases, [{ title: "서적", dataSource: "collection://c1" }]);
  assert.deepEqual(r.warnings, ["알 수 없는 노션 블록(alias)"]);
  assert.doesNotMatch(r.markdown, /<\/?[a-z-]+[ >\/]/);
});

test("escaped notion text keeps its literal characters", () => {
  assert.equal(md("0\\. \\<web-app> 과 \\[인강\\] 와 \\$ 서적").markdown, "0\\. \\<web-app> 과 \\[인강\\] 와 \\$ 서적");
});

test("empty one-line containers disappear", () => {
  assert.equal(md('앞\n<li></li>\n\n<p> </p>\n\n<column ratio="100"></column>\n\n<p>짧은 문단</p>\n뒤').markdown, "앞\n\n짧은 문단\n뒤");
});

test("everything inside a callout stays quoted, including nested lists", () => {
  const r = md('<callout icon="💡" color="gray_bg">\n제목\n\n- a\n  - b\n</callout>\n밖');
  assert.equal(r.markdown, "> 💡 제목\n>\n> - a\n>   - b\n\n밖");
});

test("the Notion table-of-contents block and its '목차' label (often inside a toggle) are dropped", () => {
  assert.equal(md("<toggle>\n<i><b><u>목차</u></b></i>\n\n<table-of-contents color=\"gray_bg\" />\n</toggle>\n\n# 소개").markdown, "# 소개");
  assert.equal(md("<i><b><u>목차</u></b></i>\n\n<table-of-contents color=\"gray_bg\" />\n\n본문").markdown, "본문");
});
