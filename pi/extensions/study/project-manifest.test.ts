import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectManifest, manifestFromCurriculum, saveProjectManifest } from "./project-manifest.ts";

test("extracts environment and chapter lab modes from curriculum", async () => {
  const manifest = manifestFromCurriculum({
    environment: { language: "Kotlin", sharedWorkspace: "app", services: [{ name: "study-redis", hostPort: 6380 }] },
    phases: [{ chapters: [{ slug: "ch-01-cache", title: "Cache", lab: { mode: "cli", evidence: ["command"] } }, { slug: "ch-02-pattern", title: "Pattern", lab: { mode: "application", workspace: "app" } }] }],
  }, "study-cache", "Caching");
  assert.equal(manifest.environment?.sharedWorkspace, "app");
  assert.equal(manifest.chapters["ch-01-cache"].lab?.mode, "cli");
  assert.equal(manifest.chapters["ch-02-pattern"].lab?.workspace, "app");
  const root = await mkdtemp(join(tmpdir(), "study-manifest-"));
  await saveProjectManifest(root, manifest);
  assert.deepEqual(await loadProjectManifest(root), manifest);
});
