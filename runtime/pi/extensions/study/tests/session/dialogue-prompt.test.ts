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
