import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyWorkspaceRegistration,
  previewWorkspaceRegistration,
} from "../../src/workspace/workspace-registration.ts";
import { readWorkspace } from "../../src/workspace/workspace-root.ts";
import { tempDir, treeDigest } from "../support/workspace-fixture.ts";

async function legacyRoot(t: any) {
  const root = await tempDir(t);
  await mkdir(join(root, "study-alpha", "ch-01-intro"), { recursive: true });
  await mkdir(join(root, "study-alpha", ".study"), { recursive: true });
  await writeFile(
    join(root, "study-alpha", ".study", "project.json"),
    JSON.stringify({
      version: 1,
      projectSlug: "study-alpha",
      topic: "Alpha",
      environment: { language: "Kotlin" },
      custom: { keep: true },
      chapters: {},
    }),
  );
  await mkdir(join(root, "study-beta", "ch-01-x"), { recursive: true });
  await mkdir(join(root, "backlog"), { recursive: true });
  await mkdir(join(root, "notes"), { recursive: true });
  await writeFile(join(root, ".gitignore"), "node_modules/\n");
  return root;
}

test("preview is read-only and lists the planned registration", async (t) => {
  const root = await legacyRoot(t);
  const before = await treeDigest(root);
  const preview = await previewWorkspaceRegistration(root);
  assert.equal(await treeDigest(root), before);
  assert.deepEqual(
    preview.projects.map((p) => p.slug),
    ["study-alpha", "study-beta"],
  );
  assert.deepEqual(
    preview.plan!.changes.map((c) => c.path).sort(),
    [".gitignore", ".study/workspace.json", "study-alpha/.study/project.json", "study-beta/.study/project.json"],
  );
  assert.match(preview.summary, /study-alpha/);
});

test("apply registers the root, preserves manifest fields and gitignores local data", async (t) => {
  const root = await legacyRoot(t);
  const preview = await previewWorkspaceRegistration(root);
  await applyWorkspaceRegistration(root, preview);
  const workspace = await readWorkspace(root);
  assert.equal(workspace.manifest.timezone, "Asia/Seoul");
  assert.deepEqual(workspace.manifest.review.intervals, [1, 3, 7, 14]);
  const alpha = JSON.parse(await readFile(join(root, "study-alpha", ".study", "project.json"), "utf8"));
  assert.deepEqual(alpha.custom, { keep: true });
  assert.equal(alpha.environment.language, "Kotlin");
  assert.equal(alpha.projectId, workspace.manifest.projects[0].id);
  const beta = JSON.parse(await readFile(join(root, "study-beta", ".study", "project.json"), "utf8"));
  assert.equal(beta.projectSlug, "study-beta");
  assert.equal(await readFile(join(root, ".gitignore"), "utf8"), "node_modules/\n.study/local/\n");
});

test("re-registration keeps existing IDs and is a no-op when nothing changed", async (t) => {
  const root = await legacyRoot(t);
  await applyWorkspaceRegistration(root, await previewWorkspaceRegistration(root));
  const first = await readWorkspace(root);
  const again = await previewWorkspaceRegistration(root);
  assert.equal(again.plan, null);
  await mkdir(join(root, "study-gamma", "ch-01-y"), { recursive: true });
  const added = await previewWorkspaceRegistration(root);
  await applyWorkspaceRegistration(root, added);
  const second = await readWorkspace(root);
  assert.equal(second.manifest.workspaceId, first.manifest.workspaceId);
  assert.deepEqual(second.manifest.projects.slice(0, 2), first.manifest.projects);
  assert.equal(second.manifest.projects.length, 3);
});

test("a stale preview is rejected and corrupt project manifests are not regenerated", async (t) => {
  const root = await legacyRoot(t);
  const preview = await previewWorkspaceRegistration(root);
  await writeFile(join(root, ".gitignore"), "changed\n");
  await assert.rejects(applyWorkspaceRegistration(root, preview), /다른 변경/);

  const broken = await legacyRoot(t);
  await writeFile(join(broken, "study-alpha", ".study", "project.json"), "{oops");
  const before = await treeDigest(broken);
  await assert.rejects(previewWorkspaceRegistration(broken), /project.json/);
  assert.equal(await treeDigest(broken), before);
});
