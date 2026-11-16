import { test } from "node:test";
import assert from "node:assert/strict";
import { recordAnswer } from "../../src/evidence/evidence-store.ts";
import { prepareQuestion } from "../../src/evidence/question-store.ts";
import { diagnosisAnswerReview } from "../../src/session/diagnosis-answers.ts";
import { diagnosisPrepareOptions, finishDiagnosisRun } from "../../src/session/dialogue-store.ts";
import { knowledgeWorkspace, scoredQuestion } from "../support/evidence-fixture.ts";

test("finishing a chapter diagnosis lists each question with the learner's first answer and the latest verdict", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  const ask = async (requestId: string, prompt: string) => {
    const input = scoredQuestion([refA], { requestId, prompt });
    return prepareQuestion(root, input as any, await diagnosisPrepareOptions(root, input as any));
  };
  const q1 = await ask("d-1", "만료된 키를 GET하면?");
  await ask("d-2", "답하지 않은 질문");
  const base = { questionId: q1.id, responseAnchor: "msg-3", assistance: "independent" as const };
  await recordAnswer(root, { ...base, submissionId: "s1", response: "이전 값이 나온다", confidence: 0.8, submittedAt: "2026-11-16T01:00:00.000Z", findings: [{ ref: refA, result: "incorrect", reason: "만료 후 없음" }] });
  await recordAnswer(root, { ...base, submissionId: "s2", response: "이전 값이 나온다", submittedAt: "2026-11-16T01:05:00.000Z", correctionOf: "s1", findings: [{ ref: refA, result: "partial", reason: "재판정" }] });
  const run = await finishDiagnosisRun(root, "study-alpha", "ch-01-intro", { reason: "user_request", unverified: [] });
  const text = await diagnosisAnswerReview(root, run);
  assert.match(text, /### Q1\n\n- 질문: 만료된 키를 GET하면\? \(A\) nil \/ \(B\) 이전 값\n- 내 답: 이전 값이 나온다\n- 확신도: 8\/10\n- 판정: 부분 정답\n- 정답: A/);
  assert.match(text, /### Q2\n\n- 질문: 답하지 않은 질문[^\n]*\n- 내 답: \(응답 없음\)\n- 정답: A/);
});
