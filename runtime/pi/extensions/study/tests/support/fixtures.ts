import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

export async function tempDir(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "study-next-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** A study root with one project `study-alpha` and one chapter `ch-01-intro`. */
export async function workspaceFixture(t: TestContext, extra: Record<string, unknown> = {}): Promise<string> {
  const root = await tempDir(t);
  await mkdir(join(root, ".study"), { recursive: true });
  await writeFile(
    join(root, ".study", "workspace.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        workspaceId: "ws-test",
        timezone: "Asia/Seoul",
        review: { intervals: [1, 3, 7, 14] },
        projects: [{ id: "p-1", slug: "study-alpha", path: "study-alpha" }],
        ...extra,
      },
      null,
      2,
    )}\n`,
  );
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
