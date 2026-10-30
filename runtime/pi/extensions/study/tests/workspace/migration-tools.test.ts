import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseWorkspaceCommand } from "../../src/workspace/workspace-actions.ts";
import { runWorkspaceCommand } from "../../src/workspace/workspace-command-core.ts";
import { tempDir, treeDigest } from "../support/workspace-fixture.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
const ctx = (cwd: string, confirm = true) => ({ cwd, hasUI: true, isIdle: () => true, ui: { notify() {}, confirm: async () => confirm } }) as any;

async function repo(t: any) {
  const root = await tempDir(t, "study-mig-cmd-");
  await mkdir(join(root, "study-a", "ch-01-x"), { recursive: true });
  await writeFile(join(root, "study-a", "ch-01-x", "README.md"), "# x\n");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  git(root, "add", ".");
  git(root, "commit", "-qm", "init");
  return root;
}

test("parses migrate subcommands", () => {
  assert.deepEqual(parseWorkspaceCommand("migrate"), { action: "migrate", step: "preview", root: "." });
  assert.deepEqual(parseWorkspaceCommand("migrate apply abc ~/s"), { action: "migrate", step: "apply", digest: "abc", root: "~/s" });
  assert.deepEqual(parseWorkspaceCommand("migrate undo mig-1"), { action: "migrate", step: "undo", migrationId: "mig-1", root: "." });
  assert.throws(() => parseWorkspaceCommand("migrate apply"), /사용법/);
});

test("preview through the command writes nothing and prints the approval digest", async (t) => {
  const root = await repo(t);
  const before = await treeDigest(root);
  const text = await runWorkspaceCommand(`migrate preview ${root}`, ctx(root));
  assert.equal(await treeDigest(root), before);
  assert.match(text, /migrate apply [0-9a-f]{16}/);
  assert.match(text, /복습 일정 생성: 0개/);
});

test("apply needs confirmation and the previewed digest, then undo restores the tree", async (t) => {
  const root = await repo(t);
  const digest = (await runWorkspaceCommand(`migrate preview ${root}`, ctx(root))).match(/apply ([0-9a-f]{16})/)![1];
  const before = await treeDigest(root);
  assert.match(await runWorkspaceCommand(`migrate apply ${digest} ${root}`, ctx(root, false)), /취소/);
  assert.equal(await treeDigest(root), before);
  const applied = await runWorkspaceCommand(`migrate apply ${digest} ${root}`, ctx(root));
  const id = applied.match(/(mig-[a-f0-9]{8})/)![1];
  assert.notEqual(await treeDigest(root), before);
  await runWorkspaceCommand(`migrate undo ${id} ${root}`, ctx(root));
  const { rm } = await import("node:fs/promises");
  await rm(join(root, ".study"), { recursive: true, force: true });
  assert.equal(await treeDigest(root), before);
});
