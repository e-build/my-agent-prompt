import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { safeProjectWritePath, safeWorkspacePath } from "../../src/workspace/safe-path.ts";
import { tempDir, workspaceFixture } from "../support/workspace-fixture.ts";

test("allows only the common write areas at the workspace root", async (t) => {
  const root = await workspaceFixture(t);
  assert.equal(
    await safeWorkspacePath(root, "knowledge/items/k-a.md"),
    join(root, "knowledge", "items", "k-a.md"),
  );
  assert.ok(await safeWorkspacePath(root, "review/items/k-a.json"));
  assert.ok(await safeWorkspacePath(root, ".study/local/pending/x.json"));
  for (const bad of ["README.md", "backlog/x.md", "study-alpha/README.md", "../x", "/etc/passwd", "knowledge/../README.md", "knowledge\\x"])
    await assert.rejects(safeWorkspacePath(root, bad), /경로/, bad);
});

test("project writes stay inside the project and outside common areas", async (t) => {
  const root = await workspaceFixture(t);
  const project = join(root, "study-alpha");
  assert.equal(
    await safeProjectWritePath(project, "ch-01-intro/README.md"),
    join(project, "ch-01-intro", "README.md"),
  );
  await assert.rejects(safeProjectWritePath(project, "../knowledge/x.md"), /경로/);
});

test("rejects symlinked ancestors, targets and broken links", async (t) => {
  const root = await workspaceFixture(t);
  const outside = await tempDir(t, "study-outside-");
  await symlink(outside, join(root, "knowledge"));
  await assert.rejects(safeWorkspacePath(root, "knowledge/items/k.md"), /심볼릭 링크/);

  const second = await workspaceFixture(t);
  await mkdir(join(second, "review"), { recursive: true });
  await writeFile(join(outside, "target.json"), "{}");
  await symlink(join(outside, "target.json"), join(second, "review", "x.json"));
  await assert.rejects(safeWorkspacePath(second, "review/x.json"), /심볼릭 링크/);
  await symlink(join(outside, "missing"), join(second, "review", "broken.json"));
  await assert.rejects(safeWorkspacePath(second, "review/broken.json"), /심볼릭 링크/);
});
