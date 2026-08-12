import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findStudyProjectRoot, parseStudyChapterArgs, resolveChapterSlug, resolveStudyChapterTarget } from "./study-command.ts";
import { createEmptyChapterState, saveStudyState, type StudyState } from "./study-state.ts";

test("parses existing study-chapter argument forms", () => {
  assert.deepEqual(parseStudyChapterArgs(""), {});
  assert.deepEqual(parseStudyChapterArgs("02"), { chapterArg: "02", phaseArg: undefined });
  assert.deepEqual(parseStudyChapterArgs("02 test"), { chapterArg: "02", phaseArg: "test" });
  assert.deepEqual(parseStudyChapterArgs("diagnosis"), { phaseArg: "diagnosis" });
  assert.throws(() => parseStudyChapterArgs("02 nope"), /단계는/);
});

test("resolves numeric and slug chapter arguments", () => {
  const chapter = createEmptyChapterState();
  const state: StudyState = {
    version: 1,
    projectRoot: "/tmp/study-cache",
    createdAt: "x",
    updatedAt: "x",
    chapters: {
      "ch-01-cache": chapter,
      "ch-02-read-through": createEmptyChapterState(),
    },
  };
  assert.equal(resolveChapterSlug(state, "02"), "ch-02-read-through");
  assert.equal(resolveChapterSlug(state, "read-through"), "ch-02-read-through");
});

test("finds project root from a nested chapter directory and resolves next phase", async () => {
  const base = await mkdtemp(join(tmpdir(), "study-command-"));
  const root = join(base, "study-cache");
  const ch1 = join(root, "ch-01-cache");
  await mkdir(ch1, { recursive: true });
  await writeFile(join(ch1, "README.md"), "# Ch 01 — Cache\n");
  const chapter = createEmptyChapterState();
  chapter.diagnosis.status = "completed";
  const state: StudyState = {
    version: 1,
    projectRoot: root,
    createdAt: "x",
    updatedAt: "x",
    chapters: { "ch-01-cache": chapter },
  };
  await saveStudyState(root, state);
  assert.equal(await findStudyProjectRoot(ch1), root);
  const target = await resolveStudyChapterTarget(ch1, "");
  assert.equal(target.chapterSlug, "ch-01-cache");
  assert.equal(target.phase, "concept");
});
