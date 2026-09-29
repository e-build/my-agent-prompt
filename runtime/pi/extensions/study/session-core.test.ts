import { test } from "node:test";
import assert from "node:assert/strict";

import { findReusableTestSession, hasAssessmentSession, type SessionLike } from "./session-core.ts";

function session(overrides: Partial<SessionLike>): SessionLike {
  return { chapterSlug: "ch-01", attempt: 1, status: "open", ...overrides };
}

test("findReusableTestSession reuses only an open session of the same chapter and attempt", () => {
  const open = session({ chapterSlug: "ch-01", attempt: 2, status: "open" });
  const pool: SessionLike[] = [
    session({ chapterSlug: "ch-01", attempt: 1, status: "open" }),
    session({ chapterSlug: "ch-02", attempt: 2, status: "open" }),
    session({ chapterSlug: "ch-01", attempt: 2, status: "submitted" }),
    open,
  ];
  assert.equal(findReusableTestSession(pool, "ch-01", 2), open);
  assert.equal(findReusableTestSession(pool, "ch-01", 3), null);
  assert.equal(findReusableTestSession([], "ch-01", 1), null);
});

test("hasAssessmentSession detects any session of the chapter regardless of status", () => {
  const pool: SessionLike[] = [
    session({ chapterSlug: "ch-01", status: "acknowledged" }),
  ];
  assert.equal(hasAssessmentSession(pool, "ch-01"), true);
  assert.equal(hasAssessmentSession(pool, "ch-02"), false);
  assert.equal(hasAssessmentSession([], "ch-01"), false);
});
