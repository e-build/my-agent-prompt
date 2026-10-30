import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { TestContext } from "node:test";
import type { WorkspaceManifest } from "../../src/workspace/workspace-types.ts";

export function manifest(overrides: Partial<WorkspaceManifest> = {}): WorkspaceManifest {
  return {
    schemaVersion: 1,
    workspaceId: "ws-test",
    timezone: "Asia/Seoul",
    review: { intervals: [1, 3, 7, 14] },
    projects: [{ id: "p-alpha", slug: "study-alpha", path: "study-alpha" }],
    ...overrides,
  };
}

export async function tempDir(t: TestContext, prefix = "study-ws-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** Registered root with one project and one chapter. */
export async function workspaceFixture(t: TestContext, value = manifest()): Promise<string> {
  const root = await tempDir(t);
  await mkdir(join(root, ".study"), { recursive: true });
  await writeFile(join(root, ".study", "workspace.json"), `${JSON.stringify(value, null, 2)}\n`);
  await mkdir(join(root, "study-alpha", "ch-01-intro"), { recursive: true });
  await mkdir(join(root, "study-alpha", ".study"), { recursive: true });
  await writeFile(
    join(root, "study-alpha", ".study", "project.json"),
    JSON.stringify({ version: 1, projectSlug: "study-alpha", topic: "Alpha", chapters: {} }),
  );
  await writeFile(join(root, "study-alpha", "README.md"), "# Alpha\n");
  await writeFile(join(root, "study-alpha", "ch-01-intro", "README.md"), "# Ch 01 — Intro\n");
  return root;
}

/** Stable digest of every file path and content below root. */
export async function treeDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function walk(dir: string): Promise<void> {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const path = join(dir, entry.name);
      hash.update(`${relative(root, path)}\n`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) hash.update(await readFile(path));
    }
  }
  await walk(root);
  return hash.digest("hex");
}
