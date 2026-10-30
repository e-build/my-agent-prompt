import { test } from "node:test";
import assert from "node:assert/strict";
import { createAssessmentOpenGuard } from "../../src/session/assessment-open-guard.ts";

function setup(hasSession = false) {
  const messages: string[] = [];
  const guard = createAssessmentOpenGuard({
    send: (m) => messages.push(m),
    hasOpenSession: () => hasSession,
  });
  return { guard, messages };
}

test("test phase still requires the browser exam and nudges once", () => {
  const { guard, messages } = setup();
  guard.setTarget({ chapterSlug: "ch-01", phase: "test" });
  guard.onTurnEnd();
  guard.onTurnEnd();
  assert.equal(messages.length, 1);
  assert.match(messages[0], /study_test_open/);
});

test("observing the test tool or an open session suppresses the nudge", () => {
  const a = setup();
  a.guard.setTarget({ chapterSlug: "ch-01", phase: "test" });
  a.guard.onToolEnd("study_test_open");
  a.guard.onTurnEnd();
  assert.deepEqual(a.messages, []);
  const b = setup(true);
  b.guard.setTarget({ chapterSlug: "ch-01", phase: "test" });
  b.guard.onTurnEnd();
  assert.deepEqual(b.messages, []);
});

test("diagnosis no longer forces the HTML assessment", () => {
  const { guard, messages } = setup();
  guard.setTarget({ chapterSlug: "ch-01", phase: "diagnosis" });
  guard.onTurnEnd();
  assert.deepEqual(messages, []);
});

test("a new target resets the one-time nudge", () => {
  const { guard, messages } = setup();
  guard.setTarget({ chapterSlug: "ch-01", phase: "test" });
  guard.onTurnEnd();
  guard.setTarget({ chapterSlug: "ch-02", phase: "test" });
  guard.onTurnEnd();
  assert.equal(messages.length, 2);
  guard.clear();
  guard.onTurnEnd();
  assert.equal(messages.length, 2);
});
