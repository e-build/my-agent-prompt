import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareQuestion } from "../../src/evidence/question-store.ts";
import {
  diagnosisPrepareOptions,
  finishDiagnosisRun,
  loadDialogue,
  startDiagnosisAttempt,
} from "../../src/session/dialogue-store.ts";
import { loadStudyState } from "../../src/session/study-state.ts";
import { knowledgeWorkspace, scoredQuestion } from "../support/evidence-fixture.ts";

async function ask(root: string, ref: any, n: number) {
  const input = scoredQuestion([ref], { requestId: `diag-${n}`, prompt: `질문 ${n}` });
  return prepareQuestion(root, input as any, await diagnosisPrepareOptions(root, input as any));
}

test("the first diagnosis question starts an attempt and every question counts once", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  assert.equal(await loadDialogue(root, "study-alpha", "ch-01-intro"), null);
  const q1 = await ask(root, refA, 1);
  await ask(root, refA, 1);
  const dialogue = (await loadDialogue(root, "study-alpha", "ch-01-intro"))!;
  assert.deepEqual(dialogue.runs[0].questionIds, [q1.id]);
  assert.equal(dialogue.runs[0].limit, 8);
});

test("the limit survives reloads and a failed limit check writes nothing", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  for (let n = 0; n < 8; n++) await ask(root, refA, n);
  const path = join(root, "study-alpha", ".study", "dialogue", "ch-01-intro.json");
  const before = await readFile(path, "utf8");
  await assert.rejects(ask(root, refA, 99), /상한/);
  assert.equal(await readFile(path, "utf8"), before);
});

test("finishing records the route and completes the diagnosis phase in one change", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  await ask(root, refA, 1);
  await ask(root, refA, 2);
  const finished = await finishDiagnosisRun(root, "study-alpha", "ch-01-intro", {
    reason: "route_decided",
    route: { summary: "갱신 정책부터", startAt: "갱신", focus: ["TTL 갱신"], skip: [] },
    unverified: ["이벤트 지연"],
  });
  assert.equal(finished.status, "finished");
  const state = await loadStudyState(join(root, "study-alpha"));
  assert.equal(state.chapters["ch-01-intro"].diagnosis.status, "completed");
  assert.match(state.chapters["ch-01-intro"].diagnosis.evidence![0], /dialogue/);
  await assert.rejects(ask(root, refA, 3), /종료/);
});

test("a new attempt is explicit and starts a fresh counter", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  await ask(root, refA, 1);
  await assert.rejects(startDiagnosisAttempt(root, "study-alpha", "ch-01-intro"), /진행 중/);
  await finishDiagnosisRun(root, "study-alpha", "ch-01-intro", { reason: "user_request", unverified: [] });
  const run = await startDiagnosisAttempt(root, "study-alpha", "ch-01-intro");
  assert.equal(run.questionIds.length, 0);
  assert.equal((await loadDialogue(root, "study-alpha", "ch-01-intro"))!.runs.length, 2);
});
