import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPlacementQuestion,
  createPlacement,
  finishPlacement,
  publicPlacement,
  recordPlacementAnswer,
  restorePlacement,
} from "../../src/placement/placement-state.ts";

const AT = "2026-11-02T00:00:00.000Z";
const strands = [
  { id: "lifecycle", name: "스레드 생명주기", why: "실행기 워커를 이해하려면 필요" },
  { id: "shared", name: "공유 상태", why: "작업 큐 동기화의 전제" },
];
const start = (limit?: number) => createPlacement({ id: "pl-1", projectSlug: "study-java-threads", strands, limit, at: AT });
const scored = (requestId: string, strandId = "shared") => ({
  requestId,
  strandId,
  prompt: `${requestId} 질문`,
  scored: true as const,
  criteria: { answer: "A", acceptable: [], rubric: "정확히 A", conditions: [] },
  at: AT,
});

test("a placement starts open with the eight-question default and named strands", () => {
  const run = start();
  assert.equal(run.limit, 8);
  assert.equal(run.status, "open");
  assert.deepEqual(run.questions, []);
  assert.deepEqual(run.unverified, []);
  assert.throws(() => createPlacement({ id: "x", projectSlug: "p", strands: [], at: AT }), /갈래/);
  assert.throws(() => createPlacement({ id: "x", projectSlug: "p", strands: [strands[0], strands[0]], at: AT }), /중복/);
  assert.throws(() => start(0), /상한/);
  assert.throws(() => start(21), /상한/);
});

test("questions are idempotent by requestId and reject a changed payload", () => {
  const run = addPlacementQuestion(start(), scored("r1"));
  assert.equal(run.questions.length, 1);
  assert.match(run.questions[0].id, /^q-[0-9a-f]{20}$/);
  const again = addPlacementQuestion(run, scored("r1"));
  assert.equal(again.questions.length, 1);
  assert.throws(() => addPlacementQuestion(run, { ...scored("r1"), prompt: "다른 질문" }), /같은 requestId/);
});

test("questions need a known strand, criteria when scored, and stop at the limit", () => {
  assert.throws(() => addPlacementQuestion(start(), scored("r1", "unknown")), /갈래/);
  assert.throws(() => addPlacementQuestion(start(), { ...scored("r1"), criteria: null }), /채점 기준/);
  const unscored = addPlacementQuestion(start(), { ...scored("r1"), scored: false, criteria: null });
  assert.equal(unscored.questions[0].criteria, null);
  let run = start(2);
  run = addPlacementQuestion(run, scored("r1"));
  run = addPlacementQuestion(run, scored("r2"));
  assert.throws(() => addPlacementQuestion(run, scored("r3")), /상한\(2\)/);
  const resumed = restorePlacement(JSON.stringify(run));
  assert.throws(() => addPlacementQuestion(resumed, scored("r3")), /상한/);
  assert.equal(addPlacementQuestion(resumed, scored("r1")).questions.length, 2);
});

test("answers are recorded once per question with the learner's own words", () => {
  const run = addPlacementQuestion(start(), scored("r1"));
  const q = run.questions[0];
  const answer = { questionId: q.id, response: "A", responseAnchor: "대화 3번째 메시지", assistance: "independent" as const, result: "demonstrated" as const, reason: "정답", at: AT };
  const answered = recordPlacementAnswer(run, answer);
  assert.equal(answered.answers.length, 1);
  assert.throws(() => recordPlacementAnswer(answered, answer), /이미 기록/);
  assert.throws(() => recordPlacementAnswer(run, { ...answer, questionId: "q-00000000000000000000" }), /질문을 찾지/);
  assert.throws(() => recordPlacementAnswer(run, { ...answer, response: " " }), /response/);
  assert.throws(() => recordPlacementAnswer(run, { ...answer, assistance: "guess" as any }), /assistance/);
  assert.throws(() => recordPlacementAnswer(run, { ...answer, result: "yes" as any }), /result/);
});

test("unscored questions only accept unverified", () => {
  const run = addPlacementQuestion(start(), { ...scored("r1"), scored: false, criteria: null });
  const q = run.questions[0];
  const base = { questionId: q.id, response: "예측", responseAnchor: "메시지", assistance: "independent" as const, reason: "", at: AT };
  assert.throws(() => recordPlacementAnswer(run, { ...base, result: "demonstrated" }), /unverified/);
  assert.equal(recordPlacementAnswer(run, { ...base, result: "unverified" }).answers[0].result, "unverified");
});

test("finishing follows the chapter diagnosis rules", () => {
  const route = { summary: "ch-01부터", startAt: "ch-01", focus: ["shared"], skip: ["lifecycle"] };
  let run = addPlacementQuestion(start(2), scored("r1"));
  assert.throws(() => finishPlacement(run, { reason: "limit_reached", route, unverified: [], at: AT }), /상한/);
  assert.throws(() => finishPlacement(run, { reason: "route_decided", unverified: [], at: AT }), /학습 경로/);
  assert.throws(() => finishPlacement(run, { reason: "whatever" as any, route, unverified: [], at: AT }), /reason/);
  const done = finishPlacement(run, { reason: "route_decided", route, unverified: ["interrupt"], at: AT });
  assert.equal(done.status, "finished");
  assert.equal(done.endReason, "route_decided");
  assert.deepEqual(done.unverified, ["interrupt"]);
  assert.throws(() => finishPlacement(done, { reason: "user_request", unverified: [], at: AT }), /이미 종료/);
  assert.throws(() => addPlacementQuestion(done, scored("r2")), /종료/);
  run = addPlacementQuestion(run, scored("r2"));
  assert.equal(finishPlacement(run, { reason: "limit_reached", route, unverified: [], at: AT }).endReason, "limit_reached");
  assert.equal(finishPlacement(run, { reason: "user_request", unverified: [], at: AT }).route, undefined);
});

test("the public view never contains criteria", () => {
  const run = addPlacementQuestion(start(), scored("r1"));
  const view = publicPlacement(run);
  assert.doesNotMatch(JSON.stringify(view), /criteria|rubric/);
  assert.equal(view.questions[0].prompt, "r1 질문");
  assert.equal(view.strands.length, 2);
});

test("restore rejects corrupt or inconsistent records", () => {
  assert.throws(() => restorePlacement("{"), /손상/);
  const run = addPlacementQuestion(start(), scored("r1"));
  const dup = { ...run, questions: [run.questions[0], run.questions[0]] };
  assert.throws(() => restorePlacement(JSON.stringify(dup)), /중복/);
  const over = { ...run, limit: 0 };
  assert.throws(() => restorePlacement(JSON.stringify(over)), /형식|상한/);
  const orphan = { ...run, answers: [{ questionId: "q-00000000000000000000", response: "x", responseAnchor: "y", assistance: "unknown", result: "unverified", reason: "", at: AT }] };
  assert.throws(() => restorePlacement(JSON.stringify(orphan)), /질문/);
});
