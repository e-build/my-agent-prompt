import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findWorkspaceRoot,
  initWorkspace,
  readWorkspace,
  registerProject,
} from "../../src/review/workspace.ts";

async function root(content?: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "ws-"));
  if (content) {
    await mkdir(join(dir, ".study"));
    await writeFile(join(dir, ".study", "workspace.json"), JSON.stringify(content));
  }
  return dir;
}

const legacy = {
  schemaVersion: 1,
  workspaceId: "ws-1",
  timezone: "Asia/Seoul",
  review: { intervals: [1, 3, 7, 14] },
  projects: [{ id: "p-1", slug: "study-a", path: "study-a" }],
};

test("an existing workspace.json is read as-is", async () => {
  const dir = await root(legacy);
  const ws = await readWorkspace(dir);
  assert.equal(ws.timezone, "Asia/Seoul");
  assert.deepEqual(ws.review.intervals, [1, 3, 7, 14]);
  assert.equal(ws.channel, undefined);
});

test("the root is found by walking up from a project directory", async () => {
  const dir = await root(legacy);
  const nested = join(dir, "study-a", "ch-01-x");
  await mkdir(nested, { recursive: true });
  assert.equal((await findWorkspaceRoot(nested))?.root, dir);
  assert.equal(await findWorkspaceRoot(await root()), null);
});

test("invalid timezone or intervals are errors", async () => {
  await assert.rejects(readWorkspace(await root({ ...legacy, timezone: "Nope/X" })), /timezone/);
  await assert.rejects(
    readWorkspace(await root({ ...legacy, review: { intervals: [3, 1] } })),
    /intervals/,
  );
});

test("an unknown channel in workspace.json is an error", async () => {
  await assert.rejects(readWorkspace(await root({ ...legacy, channel: "slack" })), /slack/);
});

test("registering a project is idempotent and keeps other fields", async () => {
  const dir = await root(legacy);
  await registerProject(dir, { slug: "study-b", path: "study-b" });
  await registerProject(dir, { slug: "study-b", path: "study-b" });
  const saved = JSON.parse(await readFile(join(dir, ".study", "workspace.json"), "utf8"));
  assert.equal(saved.workspaceId, "ws-1");
  assert.deepEqual(
    saved.projects.map((p: { slug: string }) => p.slug),
    ["study-a", "study-b"],
  );
});

test("initWorkspace creates defaults and never overwrites", async () => {
  const dir = await root();
  await initWorkspace(dir);
  const ws = await readWorkspace(dir);
  assert.equal(ws.timezone, "Asia/Seoul");
  assert.deepEqual(ws.review.intervals, [1, 3, 7, 14]);
  await registerProject(dir, { slug: "study-a", path: "study-a" });
  await initWorkspace(dir);
  assert.equal((await readWorkspace(dir)).projects.length, 1);
});
