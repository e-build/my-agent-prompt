import { test } from "node:test";
import assert from "node:assert/strict";
import { assertBodySafe, parsePage, renderPage } from "../../src/book/book-page.ts";
import { normalizeConceptName, validateConceptNode } from "../../src/book/book-types.ts";
import { assertTree, pagePaths, relativeLink } from "../../src/book/book-tree.ts";
import { conceptNode } from "./book-fixture.ts";

test("page round-trips three managed regions and keeps notes byte-identical", () => {
  const content = renderPage({
    conceptId: "cn-aaaa1111",
    regions: { head: { body: "# 인터럽트" }, main: { body: "본문" }, foot: { body: "## 배운 곳" } },
    notes: "## 메모\n\n내 메모 — 그대로\n",
  });
  const page = parsePage(content);
  assert.equal(page.conceptId, "cn-aaaa1111");
  assert.equal(page.regions.main.body, "본문");
  assert.equal(page.regions.main.edited, false);
  assert.equal(page.notes, "## 메모\n\n내 메모 — 그대로\n");
  const edited = parsePage(content.replace("본문", "내가 고친 본문"));
  assert.equal(edited.regions.main.edited, true);
  assert.equal(edited.regions.head.edited, false);
});

test("page parsing refuses broken markers and bodies that smuggle markers", () => {
  assert.throws(() => parsePage("# no frontmatter\n"), /머리말/);
  const content = renderPage({ conceptId: "cn-aaaa1111", regions: { head: { body: "h" }, main: { body: "m" }, foot: { body: "f" } }, notes: "" });
  assert.throws(() => parsePage(content.replace("<!-- /study:book -->\n\n<!-- study:book region=main", "\n\n<!-- study:book region=main")), /닫히지|중복|손상/);
  assert.throws(() => parsePage(`${content}\n<!-- study:book region=main hash=000000000000 -->\n`), /중복|손상/);
  assert.throws(() => assertBodySafe("x <!-- /study:book --> y"), /관리 영역/);
});

test("concept names are NFC directory names without path characters", () => {
  assert.equal(normalizeConceptName("인터럽트".normalize("NFD")), "인터럽트");
  for (const bad of ["a/b", "..", ".hidden", "README.md", "", "x".repeat(61), "a:b"])
    assert.throws(() => normalizeConceptName(bad));
  assert.throws(() => validateConceptNode(conceptNode({ owner: "agent", parentId: null })), /사용자 소유/);
  assert.throws(() => validateConceptNode({ ...conceptNode(), extra: 1 } as any), /알 수 없는/);
});

test("tree rules: parents exist, no cycles, case-insensitive unique siblings, one page per proposition", () => {
  const area = conceptNode({ id: "cn-area0001", name: "동시성" });
  const a = conceptNode({ id: "cn-aaaa0001", name: "Thread", parentId: area.id, owner: "agent", members: ["k-1111aaaa"] });
  assertTree([area, a]);
  assert.throws(() => assertTree([a]), /상위 개념이 없습니다/);
  assert.throws(() => assertTree([area, a, conceptNode({ id: "cn-aaaa0002", name: "thread", parentId: area.id, owner: "agent" })]), /같은 이름/);
  assert.throws(() => assertTree([area, a, conceptNode({ id: "cn-aaaa0003", name: "B", parentId: area.id, owner: "agent", members: ["k-1111aaaa"] })]), /두 페이지/);
  const x = conceptNode({ id: "cn-xxxx0001", name: "X", parentId: "cn-yyyy0001", owner: "agent" });
  const y = conceptNode({ id: "cn-yyyy0001", name: "Y", parentId: "cn-xxxx0001", owner: "agent" });
  assert.throws(() => assertTree([x, y]), /순환/);
  assert.equal(pagePaths([area, a]).get(a.id), "book/동시성/Thread/README.md");
  assert.equal(relativeLink("book/동시성/Thread/README.md", "study-alpha/ch-01-intro/README.md"), "../../../study-alpha/ch-01-intro/README.md");
  assert.equal(relativeLink("book/a b/README.md", "book/README.md"), "../README.md");
});
