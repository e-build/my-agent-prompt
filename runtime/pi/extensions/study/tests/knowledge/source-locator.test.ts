import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { locateSources } from "../../src/knowledge/source-locator.ts";
import { source } from "../support/knowledge-fixture.ts";
import { tempDir, treeDigest, workspaceFixture } from "../support/workspace-fixture.ts";

test("resolves workspace files, PC-local external files and URLs without copying anything", async (t) => {
  const root = await workspaceFixture(t);
  const outside = await tempDir(t, "study-src-");
  await writeFile(join(outside, "book.pdf"), "pdf");
  await mkdir(join(root, ".study", "local"), { recursive: true });
  await writeFile(join(root, ".study", "local", "sources.json"), JSON.stringify({ "m-book": join(outside, "book.pdf") }));
  await writeFile(join(root, "study-alpha", "notes.md"), "x");
  const before = await treeDigest(root);
  const result = await locateSources(root, [
    source({ materialId: "m-notes", kind: "workspace-file", locator: "study-alpha/notes.md#intro" }),
    source({ materialId: "m-book", kind: "external-file", locator: "p.10" }),
    source({ materialId: "m-other", kind: "external-file", locator: "p.3" }),
    source({ materialId: "m-web", kind: "url", locator: "https://redis.io/docs" }),
    source({ materialId: "m-bad", kind: "workspace-file", locator: "../secret.md" }),
  ]);
  assert.equal(await treeDigest(root), before);
  assert.deepEqual(result.map((r) => r.status), ["available", "available", "missing", "remote", "missing"]);
  assert.equal(result[1].path, join(outside, "book.pdf"));
  assert.match(result[2].message, /자료 없음/);
});
