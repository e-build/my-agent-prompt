import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDialogueStatus } from "../../src/session/dialogue-prompt.ts";
import { createDiagnosis, finishDiagnosis, prepareDiagnosisQuestion } from "../../src/session/dialogue-state.ts";

test("describes a resumable diagnosis without leaking answer keys", () => {
  let run = createDiagnosis({ id: "d1", chapterSlug: "ch-01-intro", at: "2026-10-30T00:00:00.000Z" });
  run = prepareDiagnosisQuestion(run, "q-00000000000000000001");
  const text = buildDialogueStatus({ registered: true, projectSlug: "study-alpha", run });
  assert.match(text, /진행 중/);
  assert.match(text, /1\s*\/\s*8/);
  assert.match(text, /q-00000000000000000001/);
  assert.match(text, /study_question_prepare/);
});

test("a finished diagnosis reports its route and unverified areas", () => {
  let run = createDiagnosis({ id: "d1", chapterSlug: "ch-01-intro", at: "x" });
  run = finishDiagnosis(prepareDiagnosisQuestion(run, "q1"), {
    reason: "route_decided",
    route: { summary: "갱신 정책부터", startAt: "갱신", focus: [], skip: [] },
    unverified: ["이벤트 지연"],
    at: "y",
  });
  const text = buildDialogueStatus({ registered: true, projectSlug: "study-alpha", run });
  assert.match(text, /종료/);
  assert.match(text, /갱신 정책부터/);
  assert.match(text, /이벤트 지연/);
});

test("unregistered projects are told to register instead of silently falling back", () => {
  const text = buildDialogueStatus({ registered: false });
  assert.match(text, /자동 등록/);
  assert.doesNotMatch(text, /study-workspace/);
  assert.doesNotMatch(text, /study_diagnosis_open/);
});

test("no run yet means the first prepared question starts the attempt", () => {
  const text = buildDialogueStatus({ registered: true, projectSlug: "study-alpha", run: null });
  assert.match(text, /첫 질문/);
});

test("placement results are summarised without criteria and ask only for unverified strands", () => {
  const placement = {
    summary: "7문항. 생명주기·가시성 확인",
    startAt: "ch-01 — join/interrupt부터",
    focus: ["공유 상태"],
    skip: [{ what: "start/run", reason: "Q2 정답" }],
    unverified: ["interrupt", "spurious wakeup"],
    questionCount: 7,
  };
  const text = buildDialogueStatus({ registered: true, projectSlug: "study-alpha", run: null, placement });
  assert.match(text, /## 배치 진단 결과/);
  assert.match(text, /시작점: ch-01 — join\/interrupt부터/);
  assert.match(text, /건너뜀: start\/run \(Q2 정답\)/);
  assert.match(text, /미확인: interrupt; spurious wakeup/);
  assert.match(text, /확인된 갈래는 다시 묻지/);
  assert.doesNotMatch(text, /criteria|rubric/);
  const plain = buildDialogueStatus({ registered: true, projectSlug: "study-alpha", run: null });
  assert.doesNotMatch(plain, /배치 진단 결과/);
});
