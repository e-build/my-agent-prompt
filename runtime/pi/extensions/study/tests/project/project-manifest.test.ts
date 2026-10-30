import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadProjectManifest,
  manifestFromCurriculum,
  saveProjectManifest,
} from "../../src/project/project-manifest.ts";

test("extracts environment and chapter lab modes from curriculum", async () => {
  const manifest = manifestFromCurriculum(
    {
      environment: {
        language: "Kotlin",
        sharedWorkspace: "app",
        services: [{ name: "study-redis", hostPort: 6380 }],
      },
      phases: [
        {
          chapters: [
            { slug: "ch-01-cache", title: "Cache", lab: { mode: "cli", evidence: ["command"] } },
            {
              slug: "ch-02-pattern",
              title: "Pattern",
              lab: { mode: "application", workspace: "app" },
            },
          ],
        },
      ],
    },
    "study-cache",
    "Caching",
  );
  assert.equal(manifest.environment?.sharedWorkspace, "app");
  assert.equal(manifest.chapters["ch-01-cache"].lab?.mode, "cli");
  assert.equal(manifest.chapters["ch-02-pattern"].lab?.workspace, "app");
  const root = await mkdtemp(join(tmpdir(), "study-manifest-"));
  await saveProjectManifest(root, manifest);
  assert.deepEqual(await loadProjectManifest(root), manifest);
});

test("missing manifests are null but corrupt manifests are errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "study-manifest-"));
  assert.equal(await loadProjectManifest(root), null);
  await mkdir(join(root, ".study"), { recursive: true });
  await writeFile(join(root, ".study", "project.json"), "{broken");
  await assert.rejects(loadProjectManifest(root), /project.json/);
});
