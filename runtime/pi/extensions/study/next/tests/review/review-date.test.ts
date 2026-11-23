import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarDays,
  assertDate,
  isValidTimezone,
  localDate,
} from "../../src/review/review-date.ts";

test("calendar days cross month and year boundaries", () => {
  assert.equal(addCalendarDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
});

test("invalid dates are rejected", () => {
  assert.throws(() => assertDate("2026-02-30"), /존재하지 않는/);
  assert.throws(() => assertDate("2026/01/01"), /YYYY-MM-DD/);
});

test("local date follows the study timezone", () => {
  assert.equal(localDate("2026-11-23T16:00:00Z", "Asia/Seoul"), "2026-11-24");
  assert.equal(localDate("2026-11-23T16:00:00Z", "UTC"), "2026-11-23");
});

test("timezone validation", () => {
  assert.equal(isValidTimezone("Asia/Seoul"), true);
  assert.equal(isValidTimezone("Mars/Base"), false);
  assert.equal(isValidTimezone(""), false);
});
