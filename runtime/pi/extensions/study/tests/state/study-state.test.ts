import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PHASES,
  loadStudyState,
  nextPhase,
  setPhase,
} from "../../src/state/study-state.ts";

async function project(state?: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "state-"));
  await mkdir(join(dir, ".study"), { recursive: true });
  await mkdir(join(dir, "ch-01-a"));
  await mkdir(join(dir, "ch-02-b"));
  if (state) await writeFile(join(dir, ".study", "state.json"), JSON.stringify(state));
  return dir;
}

const legacyChapter = (diagnosis: string, test = "not_started") => ({
  diagnosis: { status: diagnosis, updatedAt: "x" },
  concept: { status: "not_started", updatedAt: "x" },
  lab: { status: "not_started", updatedAt: "x" },
  test: { status: test, updatedAt: "x" },
  review: { status: "not_started", updatedAt: "x" },
});

test("phases are concept, lab, test, review", () => {
  assert.deepEqual(PHASES, ["concept", "lab", "test", "review"]);
});

test("a legacy diagnosis key is dropped", async () => {
  const dir = await project({
    version: 1,
    activePhase: "diagnosis",
    chapters: { "ch-01-a": legacyChapter("in_progress") },
  });
  const state = await loadStudyState(dir);
  assert.equal("diagnosis" in state.chapters["ch-01-a"], false);
  assert.equal(state.chapters["ch-01-a"].concept.status, "not_started");
  assert.equal(state.activePhase, undefined);
});

test("legacy awaiting statuses read as in progress", async () => {
  const dir = await project({
    version: 1,
    chapters: { "ch-01-a": legacyChapter("completed", "awaiting_review") },
  });
  assert.equal((await loadStudyState(dir)).chapters["ch-01-a"].test.status, "in_progress");
});

test("missing state is created from ch-* directories", async () => {
  const state = await loadStudyState(await project());
  assert.deepEqual(Object.keys(state.chapters), ["ch-01-a", "ch-02-b"]);
  assert.equal(state.chapters["ch-02-b"].lab.status, "not_started");
});

test("new chapter directories are added to an existing state", async () => {
  const dir = await project({ version: 1, chapters: { "ch-01-a": legacyChapter("completed") } });
  assert.deepEqual(Object.keys((await loadStudyState(dir)).chapters), ["ch-01-a", "ch-02-b"]);
});

test("a corrupt state file is reported, never reset", async () => {
  const dir = await project();
  await writeFile(join(dir, ".study", "state.json"), "{not json");
  await assert.rejects(loadStudyState(dir), /state\.json/);
});

test("invalid statuses and phases are rejected on write", async () => {
  const dir = await project();
  await assert.rejects(setPhase(dir, "ch-01-a", "test", "awaiting_review" as never), /status/);
  await assert.rejects(setPhase(dir, "ch-01-a", "diagnosis" as never, "completed"), /phase/);
  await assert.rejects(setPhase(dir, "ch-09-x", "lab", "completed"), /ch-09-x/);
});

test("nextPhase returns the first unfinished phase, review when all are done", async () => {
  const dir = await project();
  await setPhase(dir, "ch-01-a", "concept", "completed");
  let state = await loadStudyState(dir);
  assert.equal(nextPhase(state.chapters["ch-01-a"]), "lab");
  await setPhase(dir, "ch-01-a", "lab", "skipped_understood");
  await setPhase(dir, "ch-01-a", "test", "completed");
  await setPhase(dir, "ch-01-a", "review", "completed");
  state = await loadStudyState(dir);
  assert.equal(nextPhase(state.chapters["ch-01-a"]), "review");
});

test("setPhase records the patch and the active target", async () => {
  const dir = await project();
  await setPhase(dir, "ch-02-b", "test", "relearn_required", { attempt: 2, score: 3, maxScore: 5 });
  const saved = JSON.parse(await readFile(join(dir, ".study", "state.json"), "utf8"));
  assert.equal(saved.activeChapter, "ch-02-b");
  assert.equal(saved.activePhase, "test");
  assert.deepEqual(
    { ...saved.chapters["ch-02-b"].test, updatedAt: undefined },
    { status: "relearn_required", attempt: 2, score: 3, maxScore: 5, updatedAt: undefined },
  );
});
