import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCK_PATH, withWorkspaceLock } from "../../src/workspace/workspace-lock.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

test("serializes concurrent operations and releases after errors", async (t) => {
  const root = await workspaceFixture(t);
  const order: string[] = [];
  const job = (name: string) =>
    withWorkspaceLock(root, async () => {
      order.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, 20));
      order.push(`${name}:end`);
    });
  await Promise.all([job("a"), job("b"), job("c")]);
  // Acquisition order is not guaranteed; critical sections must never interleave.
  for (let i = 0; i < order.length; i += 2) {
    assert.match(order[i], /:start$/);
    assert.equal(order[i + 1], order[i].replace(":start", ":end"));
  }
  assert.equal(order.length, 6);
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
