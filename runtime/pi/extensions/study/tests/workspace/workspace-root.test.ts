import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  findWorkspaceRoot,
  projectForPath,
  readWorkspace,
  requireWorkspace,
} from "../../src/workspace/workspace-root.ts";
import { manifest, tempDir, treeDigest, workspaceFixture } from "../support/workspace-fixture.ts";

test("finds the same registered root from a nested cwd and an explicit path", async (t) => {
  const root = await workspaceFixture(t);
  const nested = await findWorkspaceRoot(join(root, "study-alpha", "ch-01-intro"));
  const explicit = await findWorkspaceRoot("/", root);
  assert.equal(nested?.root, root);
  assert.equal(explicit?.root, root);
  assert.equal(nested?.manifest.timezone, "Asia/Seoul");
  assert.equal(
    projectForPath(nested!, join(root, "study-alpha", "ch-01-intro"))?.id,
    "p-alpha",
  );
  assert.equal(projectForPath(nested!, join(root, "knowledge")), null);
});

test("discovery never creates or modifies files", async (t) => {
  const root = await workspaceFixture(t);
  const before = await treeDigest(root);
  await findWorkspaceRoot(join(root, "study-alpha"));
  await readWorkspace(root);
  assert.equal(await treeDigest(root), before);

  const unregistered = await tempDir(t);
  const emptyBefore = await treeDigest(unregistered);
  assert.equal(await findWorkspaceRoot(unregistered), null);
  await assert.rejects(requireWorkspace(unregistered), /자동 등록/);
  assert.equal(await treeDigest(unregistered), emptyBefore);
});

test("rejects corrupt, unsupported and inconsistent manifests without repair", async (t) => {
  const cases: Array<[unknown, RegExp]> = [
    [{ ...manifest(), schemaVersion: 2 }, /schemaVersion/],
    [{ ...manifest(), timezone: "Mars/Base" }, /timezone/],
    [{ ...manifest(), review: { intervals: [3, 1] } }, /intervals/],
    [
      {
        ...manifest(),
        projects: [
          { id: "p-a", slug: "a", path: "study-a" },
          { id: "p-a", slug: "b", path: "study-b" },
        ],
      },
      /중복 project ID/,
    ],
    [{ ...manifest(), projects: [{ id: "p-a", slug: "a", path: "../x" }] }, /상대 경로/],
    [{ ...manifest(), projects: [{ id: "p-a", slug: "a", path: "knowledge" }] }, /공통 영역/],
  ];
  for (const [value, pattern] of cases) {
    const root = await workspaceFixture(t, value as any);
    await assert.rejects(readWorkspace(root), pattern);
  }
  const root = await workspaceFixture(t);
  await writeFile(join(root, ".study", "workspace.json"), "{broken");
  const before = await treeDigest(root);
  await assert.rejects(findWorkspaceRoot(root), /손상/);
  assert.equal(await treeDigest(root), before);
});

test("nested registered roots are rejected", async (t) => {
  const root = await workspaceFixture(t);
  await mkdir(join(root, "study-alpha", ".study"), { recursive: true });
  await writeFile(
    join(root, "study-alpha", ".study", "workspace.json"),
    JSON.stringify(manifest({ workspaceId: "ws-inner", projects: [] })),
  );
  await assert.rejects(findWorkspaceRoot(join(root, "study-alpha")), /중첩/);
});
