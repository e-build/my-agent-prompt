import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { due, enroll, loadSchedule, recordRound } from "../../src/review/schedule.ts";

const intervals = [1, 3, 7, 14];
const key = { projectSlug: "p", chapterSlug: "ch-01-a" };
const dir = () => mkdtemp(join(tmpdir(), "sch-"));

test("an absent schedule reads as empty", async () => {
  assert.deepEqual(await loadSchedule(await dir()), { version: 1, entries: [] });
});

test("enroll sets round 1 due the next day and is idempotent", async () => {
  const root = await dir();
  await enroll(root, key, "2026-11-23", intervals);
  await enroll(root, key, "2026-11-25", intervals);
  const { entries } = await loadSchedule(root);
  assert.equal(entries.length, 1);
  assert.deepEqual(
    { round: entries[0].round, due: entries[0].due, baseDate: entries[0].baseDate },
    { round: 1, due: "2026-11-24", baseDate: "2026-11-23" },
  );
});

test("advance uses the actual review date; reset goes back to the first interval", async () => {
  const root = await dir();
  await enroll(root, key, "2026-11-23", intervals);
  await recordRound(root, key, { date: "2026-11-26", result: "advanced", cardId: "c-1" }, intervals);
  let [e] = (await loadSchedule(root)).entries;
  assert.deepEqual({ round: e.round, due: e.due }, { round: 2, due: "2026-11-29" });
  await recordRound(root, key, { date: "2026-11-29", result: "reset", cardId: "c-2" }, intervals);
  [e] = (await loadSchedule(root)).entries;
  assert.deepEqual({ round: e.round, due: e.due }, { round: 1, due: "2026-11-30" });
  assert.deepEqual(
    e.history.map((h) => h.result),
    ["advanced", "reset"],
  );
});

test("after the last interval the entry is finished", async () => {
  const root = await dir();
  await enroll(root, key, "2026-11-01", [1]);
  await recordRound(root, key, { date: "2026-11-02", result: "advanced", cardId: "c" }, [1]);
  const [e] = (await loadSchedule(root)).entries;
  assert.equal(e.due, null);
  assert.equal(e.finishedOn, "2026-11-02");
  await assert.rejects(
    recordRound(root, key, { date: "2026-11-09", result: "advanced", cardId: "d" }, [1]),
    /끝난/,
  );
});

test("future rounds cannot be recorded early", async () => {
  const root = await dir();
  await enroll(root, key, "2026-11-23", intervals);
  await assert.rejects(
    recordRound(root, key, { date: "2026-11-23", result: "advanced", cardId: "c" }, intervals),
    /예정일/,
  );
});

test("unknown entries are rejected", async () => {
  await assert.rejects(
    recordRound(await dir(), key, { date: "2026-11-24", result: "advanced", cardId: "c" }, intervals),
    /ch-01-a/,
  );
});

test("due lists overdue first, then today, and skips future or finished entries", async () => {
  const root = await dir();
  await enroll(root, { projectSlug: "p", chapterSlug: "ch-02-b" }, "2026-11-22", intervals);
  await enroll(root, key, "2026-11-20", intervals);
  await enroll(root, { projectSlug: "q", chapterSlug: "ch-01-z" }, "2026-11-23", intervals);
  const list = await due(root, "2026-11-23");
  assert.deepEqual(
    list.map((e) => e.chapterSlug),
    ["ch-01-a", "ch-02-b"],
  );
  assert.deepEqual((await due(root, "2026-11-23", { projectSlug: "q" })).length, 0);
});

test("concurrent rounds for one due date record only once", async () => {
  const root = await dir();
  await enroll(root, key, "2026-11-23", intervals);
  const results = await Promise.allSettled([
    recordRound(root, key, { date: "2026-11-24", result: "advanced", cardId: "a" }, intervals),
    recordRound(root, key, { date: "2026-11-24", result: "advanced", cardId: "b" }, intervals),
  ]);
  assert.deepEqual(
    results.map((r) => r.status).sort(),
    ["fulfilled", "rejected"],
  );
  const [e] = (await loadSchedule(root)).entries;
  assert.equal(e.history.length, 1);
});

test("a corrupt schedule is reported, never reset", async () => {
  const root = await dir();
  await mkdir(join(root, "review"));
  await writeFile(join(root, "review", "schedule.json"), "{");
  await assert.rejects(loadSchedule(root), /schedule\.json/);
});
