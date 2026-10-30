import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { completeAcknowledgedTest } from "../../src/assessment/test-completion.ts";
import { listEvidence, recordAnswer } from "../../src/evidence/evidence-store.ts";
import { prepareQuestion } from "../../src/evidence/question-store.ts";
import { updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { refOf } from "../../src/knowledge/knowledge-types.ts";
import { refreshTextbook } from "../../src/knowledge/textbook-refresh.ts";
import { dueReviews } from "../../src/review/review-query.ts";
import { loadSchedule, reviewAnswerOptions } from "../../src/review/review-store.ts";
import { finishConcept } from "../../src/session/concept-completion.ts";
import { diagnosisPrepareOptions, finishDiagnosisRun } from "../../src/session/dialogue-store.ts";
import { loadStudyState } from "../../src/session/study-state.ts";
import { applyWorkspaceRegistration, previewWorkspaceRegistration } from "../../src/workspace/workspace-registration.ts";
import { source } from "../support/knowledge-fixture.ts";
import { tempDir } from "../support/workspace-fixture.ts";

test("register → dialogue diagnosis → concept → lab evidence → HTML test → four finite review rounds", async (t) => {
  // 1. A legacy root is registered explicitly.
  const root = await tempDir(t, "study-e2e-");
  const projectRoot = join(root, "study-cache");
  const chapter = join(projectRoot, "ch-01-ttl");
  await mkdir(join(chapter, "lab"), { recursive: true });
  await writeFile(join(chapter, "README.md"), "# Ch 01 — TTL\n\n## 개념 학습 노트\n\n내 메모\n");
  await applyWorkspaceRegistration(root, await previewWorkspaceRegistration(root));

  // 2. Knowledge from the source material.
  const make = async (changeId: string, name: string) =>
    (await applyKnowledgeChange(root, { changeId, operation: "create", reason: "Redis 문서", item: { name, statement: `${name} 명제`, conditions: [], scope: "Redis", status: "confirmed", explanation: `${name} 설명`, aliases: [], sources: [source()] } })).items[0];
  const ttl = await make("k-ttl", "TTL 만료");
  const lazy = await make("k-lazy", "지연 삭제");

  // 3. Conversational diagnosis: two questions, then the route is decided.
  for (const [n, ref] of [[1, refOf(ttl)], [2, refOf(lazy)]] as const) {
    const input = { requestId: `diag-${n}`, purpose: "diagnosis" as const, scored: true, prompt: `질문 ${n}`, refs: [ref], criteria: { answer: "A", acceptable: [], rubric: "r", conditions: [] }, context: { projectSlug: "study-cache", chapterSlug: "ch-01-ttl" } };
    const q = await prepareQuestion(root, input, await diagnosisPrepareOptions(root, input));
    await recordAnswer(root, { submissionId: `d-${n}`, questionId: q.id, response: "모르겠어요", responseAnchor: `session#d${n}`, assistance: "independent", submittedAt: "2026-09-30T01:00:00.000Z", findings: [{ ref, result: n === 1 ? "demonstrated" : "incorrect", reason: "" }] });
  }
  await finishDiagnosisRun(root, "study-cache", "ch-01-ttl", { reason: "route_decided", route: { summary: "지연 삭제부터", startAt: "지연 삭제", focus: ["지연 삭제"], skip: ["TTL 정의"] }, unverified: [] });

  // 4. Concept: bind, render the managed region, finish.
  await updateBinding(root, "study-cache", "ch-01-ttl", { expectedRevision: null, regions: [{ regionId: "r-expiry", refs: [refOf(ttl), refOf(lazy)] }] });
  await refreshTextbook(root, "study-cache", "ch-01-ttl", { apply: true, insertMissingAfterHeading: "## 개념 학습 노트" });
  await finishConcept(root, "study-cache", "ch-01-ttl", { summary: "만료와 지연 삭제" });
  const readme = await readFile(join(chapter, "README.md"), "utf8");
  assert.match(readme, /내 메모/);
  assert.match(readme, /지연 삭제 설명/);

  // 5. Lab evidence (existing tool output format) and the HTML test.
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "s1", status: "completed" }] }));
  await writeFile(join(chapter, "lab", "results.md"), "- Step ID: `s1`\n");
  await writeFile(join(chapter, "test.md"), "## Attempt 1\nPASSED\n");
  const done = await completeAcknowledgedTest(projectRoot, "ch-01-ttl", { id: "t1", attempt: 1, score: 9, maxScore: 10 }, true, { now: () => new Date("2026-10-01T03:00:00.000Z") });
  assert.equal(done.status, "completed");
  const state = await loadStudyState(projectRoot);
  assert.deepEqual(
    ["diagnosis", "concept", "test"].map((p) => state.chapters["ch-01-ttl"][p as "test"].status),
    ["completed", "completed", "completed"],
  );

  // 6. Reviews: +1 independent, +3 hinted (restart), then four clean rounds end the cycle.
  const review = async (n: number, at: string, assistance: "independent" | "hinted") => {
    const current = (await loadSchedule(root, ttl.id))!;
    const q = await prepareQuestion(root, { requestId: `rv-${n}`, purpose: "review", scored: true, prompt: `복습 ${n}`, refs: [refOf(ttl)], criteria: { answer: "A", acceptable: [], rubric: "r", conditions: [] } });
    await recordAnswer(root, { submissionId: `r-${n}`, questionId: q.id, response: "답", responseAnchor: `session#r${n}`, assistance, submittedAt: at, findings: [{ ref: refOf(ttl), result: "demonstrated", reason: "" }] }, await reviewAnswerOptions(root));
    return [current.dueDate, (await loadSchedule(root, ttl.id))!];
  };
  assert.deepEqual((await dueReviews(root, { today: "2026-10-02" })).items.map((i) => i.knowledgeId).sort(), [ttl.id, lazy.id].sort());
  let [, s] = await review(1, "2026-10-02T01:00:00.000Z", "independent");
  assert.equal(s.dueDate, "2026-10-05");
  [, s] = await review(2, "2026-10-05T01:00:00.000Z", "hinted");
  assert.equal(s.dueDate, "2026-10-06");
  assert.equal(s.history.at(-1)!.outcome, "hinted_correct");
  [, s] = await review(3, "2026-10-06T01:00:00.000Z", "independent");
  [, s] = await review(4, "2026-10-09T01:00:00.000Z", "independent");
  [, s] = await review(5, "2026-10-16T01:00:00.000Z", "independent");
  [, s] = await review(6, "2026-10-30T01:00:00.000Z", "independent");
  assert.equal(s.status, "completed");
  assert.equal(s.dueDate, null);
  // The other proposition was never reviewed and is still due, unchanged.
  assert.equal((await loadSchedule(root, lazy.id))!.dueDate, "2026-10-02");
  assert.equal((await listEvidence(root, { knowledgeId: ttl.id })).filter((e) => e.context.kind === "review").length, 6);
});
