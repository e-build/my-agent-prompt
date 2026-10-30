import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { phaseSaveWarning, updateProjectPhase } from "../../src/session/phase-state.ts";

test("phase save failures are returned instead of reported as success", async () => {
  const root = await mkdtemp(join(tmpdir(), "study-phase-"));
  await mkdir(join(root, "ch-01-a"), { recursive: true });
  assert.deepEqual(await updateProjectPhase(root, "ch-01-a", "lab", "in_progress"), { saved: true });
  await writeFile(join(root, ".study", "state.json"), "{broken");
  const failed = await updateProjectPhase(root, "ch-01-a", "lab", "completed");
  assert.equal(failed.saved, false);
  assert.match(phaseSaveWarning(failed), /저장 실패/);
  assert.equal(phaseSaveWarning({ saved: true }), "");
  assert.equal(phaseSaveWarning(undefined), "");
});
