import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDiagnosis,
  finishDiagnosis,
  prepareDiagnosisQuestion,
  restoreDiagnosis,
} from "../../src/session/dialogue-state.ts";

const start = () => createDiagnosis({ id: "d1", chapterSlug: "ch-01-intro", limit: 8, at: "2026-10-30T00:00:00.000Z" });

test("reopening a diagnosis does not reset its eight-question limit", () => {
  let run = start();
  for (let n = 0; n < 8; n++) run = prepareDiagnosisQuestion(run, `q${n}`);
  const resumed = restoreDiagnosis(JSON.stringify(run));
  assert.throws(() => prepareDiagnosisQuestion(resumed, "q8"), /상한/);
  assert.equal(prepareDiagnosisQuestion(resumed, "q0").questionIds.length, 8);
});

test("a route can be decided after two questions; no minimum count", () => {
  let run = start();
  run = prepareDiagnosisQuestion(run, "q1");
  run = prepareDiagnosisQuestion(run, "q2");
  const done = finishDiagnosis(run, {
    reason: "route_decided",
    route: { summary: "만료 개념은 앎, 갱신 정책부터", startAt: "갱신 정책", focus: ["TTL 갱신"], skip: ["TTL 정의"] },
    unverified: ["만료 이벤트 지연"],
    at: "2026-10-30T00:10:00.000Z",
  });
  assert.equal(done.status, "finished");
  assert.equal(done.endReason, "route_decided");
  assert.deepEqual(done.unverified, ["만료 이벤트 지연"]);
  assert.throws(() => prepareDiagnosisQuestion(done, "q3"), /종료/);
});

test("end reasons are explicit and a route is required unless the user stopped", () => {
  const run = prepareDiagnosisQuestion(start(), "q1");
  assert.throws(() => finishDiagnosis(run, { reason: "route_decided", unverified: [], at: "x" } as any), /route/);
  assert.throws(() => finishDiagnosis(run, { reason: "bored", unverified: [], at: "x" } as any), /reason/);
  const stopped = finishDiagnosis(run, { reason: "user_request", unverified: ["전체"], at: "2026-10-30T00:00:00.000Z" });
  assert.equal(stopped.endReason, "user_request");
  assert.equal(stopped.route, undefined);
  let full = start();
  for (let n = 0; n < 8; n++) full = prepareDiagnosisQuestion(full, `q${n}`);
  assert.throws(
    () => finishDiagnosis(prepareDiagnosisQuestion(start(), "q1"), { reason: "limit_reached", route: { summary: "s", startAt: "a", focus: [], skip: [] }, unverified: [], at: "x" }),
    /상한/,
  );
  assert.equal(
    finishDiagnosis(full, { reason: "limit_reached", route: { summary: "s", startAt: "a", focus: [], skip: [] }, unverified: [], at: "2026-10-30T00:00:00.000Z" }).endReason,
    "limit_reached",
  );
});

test("restoring rejects corrupt or inconsistent runs", () => {
  assert.throws(() => restoreDiagnosis("{"), /손상/);
  const run = { ...start(), questionIds: Array.from({ length: 9 }, (_, i) => `q${i}`) };
  assert.throws(() => restoreDiagnosis(JSON.stringify(run)), /상한/);
});
