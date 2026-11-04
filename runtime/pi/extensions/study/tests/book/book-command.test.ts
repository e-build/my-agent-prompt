import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyBookChange } from "../../src/book/book-changes.ts";
import { bookCompletions, openBook } from "../../src/book/book-command.ts";
import { SITE_DIR } from "../../src/book/site-write.ts";
import { tempDir, workspaceFixture } from "../support/workspace-fixture.ts";

async function seed(t: any) {
  const root = await workspaceFixture(t);
  const area = (await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "자바", parentId: null }] })).nodes[0];
  await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [{ op: "create", name: "스레드 생명주기", parentId: area.id, aliases: ["Thread lifecycle"] }] });
  return root;
}

test("opens the dashboard, or a concept page by name, after rebuilding the site", async (t) => {
  const root = await seed(t);
  const opened: string[] = [];
  const home = await openBook(join(root, "study-alpha"), "", (url) => opened.push(url));
  assert.equal(home.url, pathToFileURL(join(root, ...SITE_DIR.split("/"), "index.html")).href);
  assert.ok(existsSync(join(root, ...SITE_DIR.split("/"), "자바", "스레드 생명주기", "index.html")));
  const page = await openBook(root, "스레드", (url) => opened.push(url));
  assert.equal(page.url, pathToFileURL(join(root, ...SITE_DIR.split("/"), "자바", "스레드 생명주기", "index.html")).href);
  assert.deepEqual(opened, [home.url, page.url]);
  assert.equal((await openBook(root, "lifecycle", () => {})).url, page.url, "aliases match too");
  await assert.rejects(openBook(root, "없는 개념", () => {}), /찾지 못했습니다: 없는 개념/);
});

test("completions list concepts by name with their path; outside a study root there are none", async (t) => {
  const root = await seed(t);
  const items = (await bookCompletions(root, "스레"))!;
  assert.deepEqual(items.map((i) => [i.value, i.description]), [["스레드 생명주기", "자바 › 스레드 생명주기"]]);
  assert.equal((await bookCompletions(root, ""))!.length, 2);
  assert.equal(await bookCompletions(await tempDir(t), ""), null);
});
