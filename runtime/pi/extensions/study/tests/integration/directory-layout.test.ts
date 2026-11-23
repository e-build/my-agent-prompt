import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const features = ["cards", "channel", "checkpoint", "flow", "lab", "prompts", "review", "state", "ui"];

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? typescriptFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return files.flat();
}

test("the root contains only the Pi entry point as TypeScript", async () => {
  assert.deepEqual((await readdir(root)).filter((name) => name.endsWith(".ts")), ["index.ts"]);
});

test("every feature has production modules and tests", async () => {
  for (const feature of features) {
    assert.ok((await typescriptFiles(join(root, "src", feature))).length, `${feature}: src`);
    assert.ok(
      (await typescriptFiles(join(root, "tests", feature))).some((p) => p.endsWith(".test.ts")),
      `${feature}: tests`,
    );
  }
});

test("production code never imports tests and never starts a server or browser", async () => {
  for (const path of await typescriptFiles(root)) {
    const local = relative(root, path).split(sep).join("/");
    if (local.endsWith(".test.ts")) assert.ok(local.startsWith("tests/"), local);
    if (local !== "index.ts" && !local.startsWith("src/")) continue;
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /node:http|createServer|openBrowser/, local);
    for (const [, specifier] of source.matchAll(/(?:from\s+|import\s*\()\s*["'](\.[^"']+)["']/g)) {
      const target = relative(root, resolve(dirname(path), specifier)).split(sep).join("/");
      assert.ok(!target.startsWith("tests/"), `${local} imports ${target}`);
    }
  }
});

test("removed features are gone from production code", async () => {
  for (const path of await typescriptFiles(join(root, "src"))) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /study_book|study_knowledge|study_test_open|GRADE_JSON|"diagnosis"/, path);
  }
});
