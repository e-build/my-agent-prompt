import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { registerApprovedProject } from "../../src/workspace/auto-registration.ts";
import { readWorkspace } from "../../src/workspace/workspace-root.ts";
import { tempDir, workspaceFixture } from "../support/workspace-fixture.ts";

async function newProject(base: string, slug = "study-pool") {
  const root = join(base, slug);
  await mkdir(join(root, "ch-01-basics"), { recursive: true });
  await mkdir(join(root, ".study"), { recursive: true });
  await writeFile(join(root, ".study", "project.json"), JSON.stringify({ version: 1, projectSlug: slug, topic: "Pool", chapters: {} }));
  await writeFile(join(root, "README.md"), "# Pool\n");
  return root;
}

test("an approved curriculum joins the enclosing registered root", async (t) => {
  const root = await workspaceFixture(t);
  const project = await newProject(root);
  const result = await registerApprovedProject(project);
  assert.equal(result.status, "joined");
  assert.equal(result.root, root);
  const ws = await readWorkspace(root);
  assert.deepEqual(ws.manifest.projects.map((p) => p.slug).sort(), ["study-alpha", "study-pool"]);
  const manifest = JSON.parse(await readFile(join(project, ".study", "project.json"), "utf8"));
  assert.equal(manifest.projectId, ws.manifest.projects.find((p) => p.slug === "study-pool")!.id);
  assert.equal(manifest.topic, "Pool");
});

test("without a registered ancestor the parent directory becomes the root", async (t) => {
  const base = await tempDir(t);
  const project = await newProject(base);
  const result = await registerApprovedProject(project);
  assert.equal(result.status, "created");
  assert.equal(result.root, base);
  assert.match(await readFile(join(base, ".gitignore"), "utf8"), /\.study\/local\//);
  assert.deepEqual((await readWorkspace(base)).manifest.projects.map((p) => p.slug), ["study-pool"]);
});

test("re-approving the same curriculum is a no-op", async (t) => {
  const root = await workspaceFixture(t);
  const project = await newProject(root);
  await registerApprovedProject(project);
  const before = await readFile(join(root, ".study", "workspace.json"), "utf8");
  assert.equal((await registerApprovedProject(project)).status, "unchanged");
  assert.equal(await readFile(join(root, ".study", "workspace.json"), "utf8"), before);
});

test("other unregistered study-* folders under the root are not swept in", async (t) => {
  const root = await workspaceFixture(t);
  await mkdir(join(root, "study-other", "ch-01-x"), { recursive: true });
  const project = await newProject(root);
  await registerApprovedProject(project);
  assert.ok(!(await readWorkspace(root)).manifest.projects.some((p) => p.slug === "study-other"));
});

test("a corrupt project manifest is reported instead of being overwritten", async (t) => {
  const root = await workspaceFixture(t);
  const project = await newProject(root);
  await writeFile(join(project, ".study", "project.json"), "{broken");
  await assert.rejects(registerApprovedProject(project), /project.json/);
  assert.equal(await readFile(join(project, ".study", "project.json"), "utf8"), "{broken");
});
