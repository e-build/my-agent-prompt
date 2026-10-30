import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkWorkspace, inspectWorkspace } from "../../src/workspace/workspace-actions.ts";
import { executePlan, preparePlan } from "../../src/workspace/change-plan.ts";
import { tempDir, treeDigest, workspaceFixture } from "../support/workspace-fixture.ts";

test("inspect reports registration state without writing", async (t) => {
  const root = await workspaceFixture(t);
  const before = await treeDigest(root);
  const result = await inspectWorkspace(join(root, "study-alpha"));
  assert.equal(result.registered, true);
  assert.equal(result.root, root);
  assert.equal(result.projects[0].slug, "study-alpha");
  assert.equal(await treeDigest(root), before);

  const empty = await tempDir(t);
  const none = await inspectWorkspace(empty);
  assert.equal(none.registered, false);
  assert.match(none.message, /자동 등록/);
});

test("check reports missing projects and pending plans", async (t) => {
  const root = await workspaceFixture(t);
  assert.deepEqual((await checkWorkspace(root)).issues, []);
  const plan = await preparePlan(root, "r1", [{ path: "knowledge/a.md", after: "A" }]);
  await assert.rejects(executePlan(root, plan, { failAfterWrites: 0 }), /failpoint/);
  await mkdir(join(root, ".study"), { recursive: true });
  const raw = JSON.parse(
    await (await import("node:fs/promises")).readFile(join(root, ".study", "workspace.json"), "utf8"),
  );
  raw.projects.push({ id: "p-missing", slug: "study-missing", path: "study-missing" });
  await writeFile(join(root, ".study", "workspace.json"), JSON.stringify(raw));
  const issues = (await checkWorkspace(root)).issues.join("\n");
  assert.match(issues, /study-missing/);
  assert.match(issues, /미완료 변경/);
});

test("check flags project manifests whose slug or ID disagree with the registration", async (t) => {
  const root = await workspaceFixture(t);
  const path = join(root, "study-alpha", ".study", "project.json");
  await writeFile(path, JSON.stringify({ version: 1, projectSlug: ".", topic: "x", chapters: {} }));
  assert.match((await checkWorkspace(root)).issues.join("\n"), /projectSlug/);
  await writeFile(path, JSON.stringify({ version: 1, projectId: "p-other", projectSlug: "study-alpha", topic: "x", chapters: {} }));
  assert.match((await checkWorkspace(root)).issues.join("\n"), /projectId/);
  await writeFile(path, "{broken");
  assert.match((await checkWorkspace(root)).issues.join("\n"), /손상/);
});


test("the session-start notice is silent when healthy and lists problems otherwise", async (t) => {
  const { workspaceHealthNotice } = await import("../../src/workspace/workspace-actions.ts");
  const root = await workspaceFixture(t);
  assert.equal(await workspaceHealthNotice(root), null);
  assert.equal(await workspaceHealthNotice(await tempDir(t)), null);
  const plan = await preparePlan(root, "r1", [{ path: "knowledge/a.md", after: "A" }]);
  await assert.rejects(executePlan(root, plan, { failAfterWrites: 0 }), /failpoint/);
  assert.match((await workspaceHealthNotice(root))!, /중단된 저장 정리/);
});
