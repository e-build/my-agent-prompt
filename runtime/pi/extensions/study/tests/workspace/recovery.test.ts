import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { executePlan, preparePlan } from "../../src/workspace/change-plan.ts";
import { inspectRecovery, recoverAll } from "../../src/workspace/recovery.ts";
import { treeDigest, workspaceFixture } from "../support/workspace-fixture.ts";

test("inspection is read-only and reports per-file states", async (t) => {
  const root = await workspaceFixture(t);
  await mkdir(join(root, "knowledge"), { recursive: true });
  const plan = await preparePlan(root, "r1", [
    { path: "knowledge/a.md", after: "A" },
    { path: "knowledge/b.md", after: "B" },
  ]);
  await assert.rejects(executePlan(root, plan, { failAfterWrites: 1 }), /failpoint/);
  const before = await treeDigest(root);
  const report = await inspectRecovery(root);
  assert.equal(await treeDigest(root), before);
  assert.equal(report.length, 1);
  assert.deepEqual(
    report[0].files.map((f) => f.state),
    ["after", "before"],
  );
  assert.equal(report[0].recoverable, true);
});

test("recoverAll retries every safe plan and leaves conflicts pending", async (t) => {
  const root = await workspaceFixture(t);
  const plan = await preparePlan(root, "r1", [{ path: "knowledge/a.md", after: "A" }]);
  await assert.rejects(executePlan(root, plan, { failAfterWrites: 0 }), /failpoint/);
  const results = await recoverAll(root, "retry");
  assert.deepEqual(results.map((r) => r.status), ["committed"]);
  assert.deepEqual(await inspectRecovery(root), []);

  const second = await preparePlan(root, "r2", [{ path: "knowledge/a.md", after: "A2" }]);
  await assert.rejects(executePlan(root, second, { failAfterWrites: 0 }), /failpoint/);
  await writeFile(join(root, "knowledge", "a.md"), "user");
  const conflict = await recoverAll(root, "retry");
  assert.equal(conflict[0].status, "conflict");
  assert.equal((await inspectRecovery(root))[0].recoverable, false);
});
