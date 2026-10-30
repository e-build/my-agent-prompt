import { test } from "node:test";
import assert from "node:assert/strict";
import { addCalendarDays, localDate } from "../../src/review/review-date.ts";
import { advanceReview, createSchedule, type ReviewSchedule } from "../../src/review/review-schedule.ts";

const base = (): ReviewSchedule =>
  createSchedule({ knowledgeId: "k-aaaa", completedOn: "2026-10-01", intervals: [1, 3, 7, 14], timezone: "Asia/Seoul", origin: { projectId: "p", chapterSlug: "ch-01" } });

const ok = (id: string, date: string) => ({ evidenceId: id, localDate: date, assistance: "independent" as const, result: "demonstrated" as const });

test("calendar arithmetic handles month ends, leap years and DST zones", () => {
  assert.equal(addCalendarDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addCalendarDays("2026-12-31", 14), "2027-01-14");
  assert.equal(localDate("2026-10-30T15:30:00.000Z", "Asia/Seoul"), "2026-10-31");
  assert.equal(localDate("2026-03-08T07:30:00.000Z", "America/New_York"), "2026-03-08");
  assert.equal(addCalendarDays("2026-03-07", 1), "2026-03-08");
  assert.throws(() => localDate("2026-10-30T00:00:00Z", "Mars/Base"), /timezone/);
  assert.throws(() => addCalendarDays("2026-02-30", 1), /날짜/);
});

test("intervals are counted from each actual review day and the cycle ends after the fourth", () => {
  let s = base();
  assert.equal(s.dueDate, "2026-10-02");
  s = advanceReview(s, ok("e1", "2026-10-02"));
  assert.equal(s.dueDate, "2026-10-05");
  s = advanceReview(s, ok("e2", "2026-10-05"));
  assert.equal(s.dueDate, "2026-10-12");
  s = advanceReview(s, ok("e3", "2026-10-12"));
  assert.equal(s.dueDate, "2026-10-26");
  s = advanceReview(s, ok("e4", "2026-10-26"));
  assert.equal(s.status, "completed");
  assert.equal(s.dueDate, null);
  assert.throws(() => advanceReview(s, ok("e5", "2026-11-01")), /종료/);
});

test("a hinted answer restarts only that proposition from one day later", () => {
  let s = advanceReview(advanceReview(base(), ok("e1", "2026-10-02")), ok("e2", "2026-10-05"));
  assert.equal(s.nextStage, 2);
  s = advanceReview(s, { evidenceId: "e3", localDate: "2026-10-12", assistance: "hinted", result: "demonstrated" });
  assert.equal(s.nextStage, 0);
  assert.equal(s.dueDate, "2026-10-13");
  assert.equal(s.history.at(-1)?.outcome, "hinted_correct");
});

test("wrong and partial answers restart; late reviews count from the actual day", () => {
  let s = advanceReview(base(), ok("e1", "2026-10-09"));
  assert.equal(s.dueDate, "2026-10-12");
  s = advanceReview(s, { evidenceId: "e2", localDate: "2026-10-12", assistance: "independent", result: "incorrect" });
  assert.equal(s.nextStage, 0);
  assert.equal(s.dueDate, "2026-10-13");
  s = advanceReview(s, { evidenceId: "e3", localDate: "2026-10-13", assistance: "independent", result: "partial" });
  assert.equal(s.history.at(-1)?.outcome, "partial");
  assert.equal(s.dueDate, "2026-10-14");
});

test("future rounds, unverified results and duplicate evidence do not move the schedule", () => {
  const s = base();
  assert.throws(() => advanceReview(s, ok("e1", "2026-10-01")), /미리/);
  const unverified = advanceReview(s, { evidenceId: "e1", localDate: "2026-10-03", assistance: "independent", result: "unverified" });
  assert.equal(unverified.dueDate, s.dueDate);
  assert.equal(unverified.nextStage, 0);
  assert.equal(unverified.history.at(-1)?.outcome, "unverified");
  const unknown = advanceReview(s, { evidenceId: "e2", localDate: "2026-10-03", assistance: "unknown", result: "demonstrated" });
  assert.equal(unknown.dueDate, s.dueDate);
  const once = advanceReview(s, ok("e3", "2026-10-02"));
  assert.equal(advanceReview(once, ok("e3", "2026-10-02")), once);
  const explained = advanceReview(s, { evidenceId: "e4", localDate: "2026-10-02", assistance: "explained", result: "demonstrated" });
  assert.equal(explained.dueDate, s.dueDate);
  assert.equal(explained.history.at(-1)?.outcome, "correction_check");
});

test("rejects invalid schedule settings", () => {
  assert.throws(() => createSchedule({ knowledgeId: "k-aaaa", completedOn: "2026-13-01", intervals: [1], timezone: "Asia/Seoul", origin: { projectId: "p", chapterSlug: "c" } }), /날짜/);
  assert.throws(() => createSchedule({ knowledgeId: "k-aaaa", completedOn: "2026-10-01", intervals: [], timezone: "Asia/Seoul", origin: { projectId: "p", chapterSlug: "c" } }), /간격/);
});
