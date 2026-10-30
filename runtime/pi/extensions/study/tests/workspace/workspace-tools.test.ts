import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkWorkspace,
  inspectWorkspace,
  parseWorkspaceCommand,
} from "../../src/workspace/workspace-actions.ts";
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
  assert.match(none.message, /study-workspace init/);
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

test("parses command arguments", () => {
  assert.deepEqual(parseWorkspaceCommand(""), { action: "inspect" });
  assert.deepEqual(parseWorkspaceCommand("init ~/study"), { action: "init", root: "~/study" });
  assert.deepEqual(parseWorkspaceCommand("recover rollback"), { action: "recover", mode: "rollback" });
  assert.deepEqual(parseWorkspaceCommand("recover"), { action: "recover", mode: "retry" });
  assert.deepEqual(parseWorkspaceCommand("check"), { action: "check" });
  assert.throws(() => parseWorkspaceCommand("nuke"), /inspect\|init/);
});

test("init requires explicit confirmation and declining writes nothing", async (t) => {
  const { runWorkspaceCommand } = await import("../../src/workspace/workspace-command-core.ts");
  const root = await tempDir(t);
  await mkdir(join(root, "study-alpha", "ch-01-a"), { recursive: true });
  const before = await treeDigest(root);
  const declined = await runWorkspaceCommand(`init ${root}`, {
    cwd: root,
    hasUI: true,
    isIdle: () => true,
    ui: { notify() {}, confirm: async () => false },
  } as any);
  assert.match(declined, /취소/);
  assert.equal(await treeDigest(root), before);

  const headless = await runWorkspaceCommand(`init ${root}`, {
    cwd: root,
    hasUI: false,
    isIdle: () => true,
    ui: { notify() {}, confirm: async () => true },
  } as any);
  const digest = headless.match(/--confirm (\w+)/)![1];
  assert.equal(await treeDigest(root), before);
  await runWorkspaceCommand(`init ${root} --confirm wrong`, { cwd: root, hasUI: false, isIdle: () => true, ui: { notify() {}, confirm: async () => true } } as any);
  assert.equal(await treeDigest(root), before);
  const applied = await runWorkspaceCommand(`init ${root} --confirm ${digest}`, {
    cwd: root,
    hasUI: false,
    isIdle: () => true,
    ui: { notify() {}, confirm: async () => true },
  } as any);
  assert.match(applied, /committed/);
  assert.equal((await inspectWorkspace(root)).registered, true);
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

test("workspace subcommands complete with Korean descriptions", async () => {
  const { workspaceCompletions } = await import("../../src/workspace/workspace-command-core.ts");
  const all = workspaceCompletions("")!;
  assert.deepEqual(all.map((c) => c.value), ["inspect", "check", "init", "recover", "migrate"]);
  assert.ok(all.every((c) => c.description && /[가-힣]/.test(c.description)));
  assert.deepEqual(workspaceCompletions("re")!.map((c) => c.value), ["recover"]);
  assert.deepEqual(workspaceCompletions("recover ")!.map((c) => c.value), ["recover retry", "recover rollback"]);
  assert.deepEqual(workspaceCompletions("migrate ")!.map((c) => c.value), ["migrate preview", "migrate apply", "migrate undo"]);
  assert.equal(workspaceCompletions("zzz"), null);
});

test("no arguments with UI shows a short menu instead of requiring a subcommand", async (t) => {
  const { runWorkspaceCommand } = await import("../../src/workspace/workspace-command-core.ts");
  const root = await workspaceFixture(t);
  let shown: string[] = [];
  const result = await runWorkspaceCommand("", {
    cwd: root,
    hasUI: true,
    isIdle: () => true,
    ui: { notify() {}, confirm: async () => false, select: async (_t: string, o: string[]) => ((shown = o), o.find((x) => x.startsWith("검사"))) },
  } as any);
  assert.ok(shown.length >= 3 && shown.length <= 5);
  assert.match(result, /검사 통과/);
});
