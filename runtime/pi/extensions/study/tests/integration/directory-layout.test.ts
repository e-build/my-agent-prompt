import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const features = [
  "assessment",
  "bridge",
  "checkpoint",
  "curriculum",
  "evidence",
  "knowledge",
  "lab",
  "project",
  "review",
  "session",
  "workspace",
];

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

test("the extension root contains only the Pi entry point as TypeScript", async () => {
  assert.deepEqual(
    (await readdir(root)).filter((name) => name.endsWith(".ts")),
    ["index.ts"],
  );
});

test("production and tests use matching feature directories", async () => {
  for (const feature of features) {
    const source = await typescriptFiles(join(root, "src", feature));
    const tests = await typescriptFiles(join(root, "tests", feature));
    assert.ok(source.length > 0, `${feature}: production modules required`);
    assert.ok(
      tests.some((path) => path.endsWith(".test.ts")),
      `${feature}: tests required`,
    );
  }
});

test("production code never imports tests and all test cases live under tests", async () => {
  const files = await typescriptFiles(root);
  for (const path of files) {
    const local = relative(root, path).split(sep).join("/");
    if (local.endsWith(".test.ts")) assert.ok(local.startsWith("tests/"), local);
    if (local !== "index.ts" && !local.startsWith("src/")) continue;
    assert.ok(!local.endsWith(".test.ts"), local);
    const source = await readFile(path, "utf8");
    for (const [, specifier] of source.matchAll(/(?:from\s+|import\s*\()\s*["'](\.[^"']+)["']/g)) {
      const target = relative(root, resolve(dirname(path), specifier))
        .split(sep)
        .join("/");
      assert.ok(!target.startsWith("tests/"), `${local} imports ${target}`);
    }
  }
});
