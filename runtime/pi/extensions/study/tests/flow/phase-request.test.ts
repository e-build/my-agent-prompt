import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPhaseRequest } from "../../src/flow/phase-request.ts";

const base = {
  projectRoot: "/p",
  chapterSlug: "ch-01-a",
  chapterTitle: "NULL",
  status: "not_started" as const,
  channel: "plannotator",
  body: "BODY",
  warnings: [],
};

test("the header precedes the body and concept carries the chapter placement start", () => {
  const text = buildPhaseRequest({
    ...base,
    phase: "concept",
    placement: { startAt: "3값 논리", skip: ["IS NULL"], focus: ["NOT IN"], unverified: ["COUNT(col)"] },
  });
  assert.ok(text.startsWith("# STUDY_PHASE_REQUEST\n"));
  assert.match(text, /- phase: concept/);
  assert.match(text, /- channel: plannotator/);
  assert.match(text, /## 이 챕터의 출발점 \(배치 진단\)/);
  assert.match(text, /- 미확인: COUNT\(col\)/);
  assert.ok(text.trimEnd().endsWith("BODY"));
});

test("without placement data concept says so instead of inventing one", () => {
  const text = buildPhaseRequest({ ...base, phase: "concept" });
  assert.match(text, /배치 진단 기록 없음/);
});

test("other phases do not carry the placement section", () => {
  const text = buildPhaseRequest({
    ...base,
    phase: "lab",
    placement: { startAt: "x", skip: [], focus: [], unverified: [] },
  });
  assert.doesNotMatch(text, /출발점/);
});

test("override warnings are shown above the body", () => {
  const text = buildPhaseRequest({ ...base, phase: "lab", warnings: ["읽지 못함"] });
  assert.match(text, /⚠️ 읽지 못함\n\nBODY$/);
});

test("extra context lines are placed after the header", () => {
  const text = buildPhaseRequest({ ...base, phase: "test", extra: ["- attempt: 2", "- weak: q2"] });
  assert.match(text, /- currentStatus: not_started\n- attempt: 2\n- weak: q2/);
});
