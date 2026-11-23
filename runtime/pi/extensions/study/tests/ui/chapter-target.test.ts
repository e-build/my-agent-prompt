import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStudyChapterArgs, resolveChapterSlug } from "../../src/ui/chapter-target.ts";
import type { StudyState } from "../../src/state/study-state.ts";

const status = (s: string) => ({ status: s, updatedAt: "x" });
const chapter = (concept = "not_started") => ({
  concept: status(concept),
  lab: status("not_started"),
  test: status("not_started"),
  review: status("not_started"),
});
const state = (extra: Partial<StudyState> = {}): StudyState =>
  ({
    version: 1,
    updatedAt: "x",
    chapters: { "ch-01-null": chapter("completed"), "ch-02-join": chapter(), "ch-12-window": chapter() },
    ...extra,
  }) as StudyState;

test("arguments accept chapter, phase, or both in Korean or English", () => {
  assert.deepEqual(parseStudyChapterArgs(""), {});
  assert.deepEqual(parseStudyChapterArgs("시험"), { phaseArg: "test" });
  assert.deepEqual(parseStudyChapterArgs("02 lab"), { chapterArg: "02", phaseArg: "lab" });
  assert.throws(() => parseStudyChapterArgs("02 진단"), /개념\|실습\|시험\|복습/);
});

test("chapters resolve by number, slug or part of a slug", () => {
  assert.equal(resolveChapterSlug(state(), "2"), "ch-02-join");
  assert.equal(resolveChapterSlug(state(), "ch-12-window"), "ch-12-window");
  assert.equal(resolveChapterSlug(state(), "window"), "ch-12-window");
  assert.throws(() => resolveChapterSlug(state(), "zzz"), /찾지 못했습니다/);
  assert.throws(() => resolveChapterSlug(state(), "ch-"), /여러 개/);
});

test("without an argument the active chapter wins, else the first unfinished", () => {
  assert.equal(resolveChapterSlug(state({ activeChapter: "ch-12-window" })), "ch-12-window");
  assert.equal(resolveChapterSlug(state()), "ch-01-null");
});
