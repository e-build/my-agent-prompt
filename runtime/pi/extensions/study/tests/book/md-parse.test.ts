import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "../../src/book/md-parse.ts";

test("blocks: headings, paragraphs, rules, fences of both kinds and front matter", () => {
  const doc = parseMarkdown("---\nconcept: cn-1\n---\n# 제목\n\n첫 줄\n둘째 줄\n\n---\n\n```java\nint a = 1;\n```\n\n~~~markdown\n```inner```\n~~~\n");
  assert.deepEqual(doc.map((b) => b.type), ["heading", "paragraph", "rule", "code", "code"]);
  assert.deepEqual(doc[0], { type: "heading", level: 1, text: [{ type: "text", value: "제목" }] });
  assert.deepEqual(doc[1], { type: "paragraph", text: [{ type: "text", value: "첫 줄\n둘째 줄" }] });
  assert.deepEqual(doc[3], { type: "code", lang: "java", value: "int a = 1;" });
  assert.deepEqual(doc[4], { type: "code", lang: "markdown", value: "```inner```" });
});

test("managed-region comments disappear, other HTML stays as text", () => {
  const doc = parseMarkdown("<!-- study:book region=main hash=abc -->\n본문 <b>x</b>\n<!-- /study:book -->\n");
  assert.deepEqual(doc, [{ type: "paragraph", text: [{ type: "text", value: "본문 <b>x</b>" }] }]);
});

test("lists: nesting by indent, ordered start, task boxes, loose continuation", () => {
  const doc = parseMarkdown("- a\n  - a1\n    - a1x\n- [x] b\n- [ ] c\n\n3. three\n4. four\n");
  const [ul, ol] = doc as any[];
  assert.equal(ul.type, "list");
  assert.equal(ul.ordered, false);
  assert.equal(ul.items.length, 3);
  assert.equal(ul.items[0].children[1].type, "list");
  assert.equal(ul.items[0].children[1].items[0].children[1].items[0].children[0].text[0].value, "a1x");
  assert.equal(ul.items[1].checked, true);
  assert.equal(ul.items[2].checked, false);
  assert.equal(ol.ordered, true);
  assert.equal(ol.start, 3);
  assert.equal(ol.items.length, 2);
});

test("block quotes nest any blocks", () => {
  const [quote] = parseMarkdown("> 인용\n> - 목록\n>\n> ```\n> code\n> ```\n") as any[];
  assert.equal(quote.type, "quote");
  assert.deepEqual(quote.children.map((b: any) => b.type), ["paragraph", "list", "code"]);
});

test("tables with alignment and escaped pipes; a lone pipe line is a paragraph", () => {
  const [table, para] = parseMarkdown("| 이름 | 값 | 비고 |\n|:---|---:|:-:|\n| a \\| b | `1|2` | c |\n\n| 그냥 문장\n") as any[];
  assert.equal(table.type, "table");
  assert.deepEqual(table.align, ["left", "right", "center"]);
  assert.equal(table.rows[0][0][0].value, "a | b");
  assert.deepEqual(table.rows[0][1], [{ type: "code", value: "1|2" }]);
  assert.equal(para.type, "paragraph");
});

test("inline: code, strong, em, strike, links, autolinks and escapes", () => {
  const [p] = parseMarkdown("`a*b` **굵게** *기울임* _밑줄_ ~~취소~~ [링크](a.md#x \"t\") <https://x.y> \\*별\\*") as any[];
  assert.deepEqual(p.text, [
    { type: "code", value: "a*b" },
    { type: "text", value: " " },
    { type: "strong", children: [{ type: "text", value: "굵게" }] },
    { type: "text", value: " " },
    { type: "em", children: [{ type: "text", value: "기울임" }] },
    { type: "text", value: " " },
    { type: "em", children: [{ type: "text", value: "밑줄" }] },
    { type: "text", value: " " },
    { type: "strike", children: [{ type: "text", value: "취소" }] },
    { type: "text", value: " " },
    { type: "link", href: "a.md#x", children: [{ type: "text", value: "링크" }] },
    { type: "text", value: " " },
    { type: "link", href: "https://x.y", children: [{ type: "text", value: "https://x.y" }] },
    { type: "text", value: " *별*" },
  ]);
});

test("links may contain spaces encoded or raw inside angle brackets, and nested emphasis in labels", () => {
  const [p] = parseMarkdown("[**스레드** 개념](../스레드/README.md) [b](<a b.md>)") as any[];
  assert.equal(p.text[0].href, "../스레드/README.md");
  assert.equal(p.text[0].children[0].type, "strong");
  assert.equal(p.text[2].href, "a b.md");
});

test("unclosed markers and unmatched brackets stay as text", () => {
  const [p] = parseMarkdown("2 * 3 = 6, a_b_c, [미완성 링크 그리고 `열린 코드") as any[];
  assert.equal(p.text.map((n: any) => n.value).join(""), "2 * 3 = 6, a_b_c, [미완성 링크 그리고 `열린 코드");
});

test("collectLinks finds every link href in reading order, including inside lists, quotes and tables", async () => {
  const { collectLinks } = await import("../../src/book/md-parse.ts");
  const doc = parseMarkdown("[a](a.md)\n\n- [b](<b c.md>)\n\n> [c](c.md)\n\n| x |\n|---|\n| [d](d_(1).md) |\n\n```\n[no](no.md)\n```");
  assert.deepEqual(collectLinks(doc), ["a.md", "b c.md", "c.md", "d_(1).md"]);
});

test("images parse as their own inline node with alt text and a target", () => {
  const [p] = parseMarkdown("앞 ![그림 설명](media/a%20b.png) 뒤 ![](x.png)") as any[];
  assert.deepEqual(p.text, [
    { type: "text", value: "앞 " },
    { type: "image", src: "media/a%20b.png", alt: "그림 설명" },
    { type: "text", value: " 뒤 " },
    { type: "image", src: "x.png", alt: "" },
  ]);
});
