import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadProjectManifest,
  parsePlacement,
  saveProjectManifest,
  updateProjectManifest,
} from "../../src/state/project-manifest.ts";

const dir = () => mkdtemp(join(tmpdir(), "manifest-"));

test("missing manifests are null but corrupt manifests are errors", async () => {
  const root = await dir();
  assert.equal(await loadProjectManifest(root), null);
  await mkdir(join(root, ".study"));
  await writeFile(join(root, ".study", "project.json"), "{");
  await assert.rejects(loadProjectManifest(root), /project\.json/);
});

test("save and load round-trip, keeping unknown fields", async () => {
  const root = await dir();
  await saveProjectManifest(root, {
    version: 1,
    projectSlug: "study-x",
    topic: "X",
    chapters: { "ch-01-a": { title: "A", lab: { mode: "cli" } } },
    channel: "plannotator",
    legacyField: true,
  } as never);
  const loaded = await loadProjectManifest(root);
  assert.equal(loaded?.channel, "plannotator");
  assert.equal((loaded as Record<string, unknown>).legacyField, true);
});

test("placement keeps a per-chapter start and drops answer keys", () => {
  const placement = parsePlacement({
    reason: "route_decided",
    summary: "조인은 앎",
    startAt: "ch-02",
    focus: ["NOT IN"],
    skip: [{ what: "SELECT 기초", reason: "Q1 정답" }],
    unverified: ["윈도우"],
    questionCount: 5,
    criteria: { secret: true },
    chapters: {
      "ch-01-a": { startAt: "3값 논리", skip: ["IS NULL"], focus: [], unverified: ["COUNT"] },
      "../bad": { startAt: "x" },
    },
  });
  assert.equal("criteria" in placement, false);
  assert.deepEqual(Object.keys(placement.chapters), ["ch-01-a"]);
  assert.deepEqual(placement.chapters["ch-01-a"].unverified, ["COUNT"]);
});

test("placement requires a reason from the known list", () => {
  assert.throws(() => parsePlacement({ summary: "s", startAt: "a", reason: "bored" }), /reason/);
});

test("updateProjectManifest edits one field and refuses when none exists", async () => {
  const root = await dir();
  await assert.rejects(updateProjectManifest(root, (m) => m), /project\.json/);
  await saveProjectManifest(root, { version: 1, projectSlug: "study-x", topic: "X", chapters: {} });
  await updateProjectManifest(root, (m) => ({ ...m, channel: "chat" }));
  assert.equal((await loadProjectManifest(root))?.channel, "chat");
});
