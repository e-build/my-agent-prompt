import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { applyBookChange } from "../../src/book/book-changes.ts";
import { SITE_DIR, writeBookSite } from "../../src/book/site-write.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

test("writes the whole site under .study/local/book-site with assets, and replaces stale files on rebuild", async (t) => {
  const root = await workspaceFixture(t);
  await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "자바", parentId: null }] });
  const first = await writeBookSite(root);
  const site = join(root, ...SITE_DIR.split("/"));
  assert.equal(first.dir, site);
  assert.equal(first.pages, 2);
  assert.match(await readFile(join(site, "index.html"), "utf8"), /내 교과서/);
  assert.match(await readFile(join(site, "자바", "index.html"), "utf8"), /<h1 id="자바">자바<\/h1>/);
  assert.deepEqual((await readdir(join(site, "_assets"))).sort(), ["book.css", "book.js", "mermaid.min.js", "mermaid.LICENSE", "search-index.js"].sort());
  assert.match(await readFile(join(site, "_assets", "search-index.js"), "utf8"), /^window\.__BOOK_INDEX__ = \[/);

  await mkdir(join(site, "옛날"), { recursive: true });
  await writeFile(join(site, "옛날", "index.html"), "stale");
  await writeBookSite(root);
  assert.equal(existsSync(join(site, "옛날")), false);
});

test("the site never contains study records, even when a page links to them", async (t) => {
  const root = await workspaceFixture(t);
  await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "자바", parentId: null }] });
  const page = join(root, "book", "자바", "README.md");
  await writeFile(page, (await readFile(page, "utf8")).replace("## 메모\n", "## 메모\n\n[상태](../../study-alpha/.study/project.json) [교재](../../study-alpha/ch-01-intro/README.md)\n"));
  const result = await writeBookSite(root);
  const site = join(root, ...SITE_DIR.split("/"));
  assert.ok(existsSync(join(site, "_src", "study-alpha", "ch-01-intro", "README.html")));
  assert.equal(existsSync(join(site, "_src", "study-alpha", ".study")), false);
  assert.doesNotMatch(await readFile(join(site, "자바", "index.html"), "utf8"), /project\.json/);
  assert.deepEqual(result.warnings, []);
});

test("each book change gets a comparison page, and the dashboard links to it", async (t) => {
  const root = await workspaceFixture(t);
  const area = (await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "자바", parentId: null }] })).nodes[0];
  await applyBookChange(root, "agent", { changeId: "a1", reason: "본문", operations: [{ op: "write_page", id: area.id, body: "새 본문", expectedRevisionId: area.revisionId }] });
  await writeBookSite(root);
  const site = join(root, ...SITE_DIR.split("/"));
  const change = await readFile(join(site, "_changes", "a1.html"), "utf8");
  assert.match(change, /<div class="del">- \(아직 본문이 없습니다\)<\/div>\n<div class="add">\+ 새 본문<\/div>/);
  assert.match(await readFile(join(site, "index.html"), "utf8"), /<a href="_changes\/a1\.html">a1<\/a>/);
  assert.match(await readFile(join(root, "book", "README.md"), "utf8"), /- \d{4}-\d\d-\d\d · a1 · 본문/, "the md dashboard stays plain for GitHub");
});
