import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  readTextOptional,
  sha256,
  writeFileAtomic,
} from "../../src/workspace/atomic-file.ts";
import { tempDir } from "../support/workspace-fixture.ts";

test("writes complete content and creates parents", async (t) => {
  const dir = await tempDir(t);
  const path = join(dir, "a", "b.json");
  await writeFileAtomic(path, "{}\n", { expectedSha256: null });
  assert.equal(await readFile(path, "utf8"), "{}\n");
  assert.equal(await readTextOptional(join(dir, "missing")), null);
});

test("hash precondition failure leaves the original unchanged", async (t) => {
  const dir = await tempDir(t);
  const path = join(dir, "x.txt");
  await writeFile(path, "user edit");
  await assert.rejects(
    writeFileAtomic(path, "new", { expectedSha256: sha256("old") }),
    /다른 변경/,
  );
  await assert.rejects(writeFileAtomic(path, "new", { expectedSha256: null }), /다른 변경/);
  assert.equal(await readFile(path, "utf8"), "user edit");
  await writeFileAtomic(path, "next", { expectedSha256: sha256("user edit") });
  assert.equal(await readFile(path, "utf8"), "next");
});

test("failure before rename keeps the original and removes the temp file", async (t) => {
  const dir = await tempDir(t);
  const path = join(dir, "x.txt");
  await writeFile(path, "original");
  await assert.rejects(
    writeFileAtomic(path, "new", { failBeforeRename: true }),
    /failpoint/,
  );
  assert.equal(await readFile(path, "utf8"), "original");
  assert.deepEqual(await readdir(dir), ["x.txt"]);
});
