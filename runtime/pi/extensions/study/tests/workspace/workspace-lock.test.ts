import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCK_PATH, withWorkspaceLock } from "../../src/workspace/workspace-lock.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

test("serializes concurrent operations and releases after errors", async (t) => {
  const root = await workspaceFixture(t);
  const order: string[] = [];
  const slow = withWorkspaceLock(root, async () => {
    order.push("a:start");
    await new Promise((r) => setTimeout(r, 30));
    order.push("a:end");
  });
  const fast = withWorkspaceLock(root, async () => {
    order.push("b");
  });
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ["a:start", "a:end", "b"]);
  await assert.rejects(
    withWorkspaceLock(root, async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(await withWorkspaceLock(root, async () => 1), 1);
});

test("removes a lock only when its owner process is gone", async (t) => {
  const root = await workspaceFixture(t);
  await mkdir(join(root, ".study", "local", "locks"), { recursive: true });
  await writeFile(join(root, LOCK_PATH), JSON.stringify({ pid: 999999, token: "dead" }));
  assert.equal(await withWorkspaceLock(root, async () => "ok", { isAlive: () => false }), "ok");

  await writeFile(join(root, LOCK_PATH), JSON.stringify({ pid: 1, token: "alive" }));
  await assert.rejects(
    withWorkspaceLock(root, async () => "never", { isAlive: () => true, timeoutMs: 50 }),
    /다른 study 작업/,
  );
  assert.match(await readFile(join(root, LOCK_PATH), "utf8"), /alive/);
});
