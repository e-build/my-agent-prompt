import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  executePlan,
  listPendingPlans,
  preparePlan,
  recoverPlan,
} from "../../src/workspace/change-plan.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

const files = ["knowledge/items/k-a.md", "knowledge/items/k-b.md", "review/items/k-a.json"];

async function setup(t: any) {
  const root = await workspaceFixture(t);
  await mkdir(join(root, "knowledge", "items"), { recursive: true });
  await writeFile(join(root, "knowledge", "items", "k-a.md"), "a1");
  return root;
}

async function plan(root: string, requestId = "r1") {
  return preparePlan(root, requestId, [
    { path: files[0], after: "a2" },
    { path: files[1], after: "b1" },
    { path: files[2], after: "{}" },
  ]);
}

const read = (root: string, path: string) =>
  readFile(join(root, path), "utf8").catch(() => null);

test("applies all files and clears the pending journal", async (t) => {
  const root = await setup(t);
  const result = await executePlan(root, await plan(root));
  assert.equal(result.status, "committed");
  assert.deepEqual(await Promise.all(files.map((f) => read(root, f))), ["a2", "b1", "{}"]);
  assert.deepEqual(await listPendingPlans(root), []);
});

for (const writes of [0, 1, 2, 3]) {
  test(`interruption after ${writes} writes is never reported as success and can retry or roll back`, async (t) => {
    const root = await setup(t);
    const p = await plan(root);
    await assert.rejects(executePlan(root, p, { failAfterWrites: writes }), /failpoint/);
    const pending = await listPendingPlans(root);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, p.id);
    await assert.rejects(executePlan(root, await plan(root, "r2")), /미완료 변경 계획/);

    const retryRoot = root;
    const retried = await recoverPlan(retryRoot, p.id, "retry");
    assert.equal(retried.status, "committed");
    assert.deepEqual(await Promise.all(files.map((f) => read(root, f))), ["a2", "b1", "{}"]);
    assert.deepEqual(await listPendingPlans(root), []);
  });

  test(`rollback after ${writes} writes restores only the planned state`, async (t) => {
    const root = await setup(t);
    const p = await plan(root);
    await assert.rejects(executePlan(root, p, { failAfterWrites: writes }), /failpoint/);
    const rolled = await recoverPlan(root, p.id, "rollback");
    assert.equal(rolled.status, "rolled_back");
    assert.deepEqual(await Promise.all(files.map((f) => read(root, f))), ["a1", null, null]);
  });
}

test("external edits during recovery are preserved and reported as conflicts", async (t) => {
  const root = await setup(t);
  const p = await plan(root);
  await assert.rejects(executePlan(root, p, { failAfterWrites: 1 }), /failpoint/);
  await writeFile(join(root, files[0]), "user edit");
  await assert.rejects(recoverPlan(root, p.id, "rollback"), /외부 변경/);
  await assert.rejects(recoverPlan(root, p.id, "retry"), /외부 변경/);
  assert.equal(await read(root, files[0]), "user edit");
  assert.equal((await listPendingPlans(root))[0].state, "conflict");
});

test("stale preconditions abort before any write", async (t) => {
  const root = await setup(t);
  const p = await plan(root);
  await writeFile(join(root, files[0]), "concurrent");
  await assert.rejects(executePlan(root, p), /다른 변경/);
  assert.equal(await read(root, files[0]), "concurrent");
  assert.equal(await read(root, files[1]), null);
  assert.deepEqual(await listPendingPlans(root), []);
});

test("a retried request is idempotent and a different payload is rejected", async (t) => {
  const root = await setup(t);
  const p = await plan(root);
  await executePlan(root, p);
  assert.equal((await executePlan(root, p)).status, "already_applied");
  const other = await preparePlan(root, "r1", [{ path: files[1], after: "different" }]).catch(
    (error) => error,
  );
  assert.match(String(other), /같은 requestId/);
  assert.equal(await read(root, files[1]), "b1");
});

test("rejects paths outside allowed write scopes", async (t) => {
  const root = await setup(t);
  await assert.rejects(preparePlan(root, "r", [{ path: "README.md", after: "x" }]), /경로/);
  await assert.rejects(preparePlan(root, "r", [{ path: "../x", after: "x" }]), /경로/);
  const ok = await preparePlan(root, "r", [{ path: "study-alpha/ch-01-intro/README.md", after: "x" }], {
    projectPaths: ["study-alpha"],
  });
  assert.equal(ok.changes.length, 1);
  assert.deepEqual(await readdir(join(root, ".study")), ["workspace.json"]);
});
