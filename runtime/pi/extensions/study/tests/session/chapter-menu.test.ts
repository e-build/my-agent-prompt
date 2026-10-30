import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { runStudyChapter } from "../../src/session/study-command.ts";
import { chapterReviewHooks } from "../../src/review/chapter-review-start.ts";
import { updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { loadSchedule } from "../../src/review/review-store.ts";
import { loadStudyState, saveStudyState, updatePhaseState } from "../../src/session/study-state.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";

function ui(cwd: string, answers: Array<(options: string[]) => string | undefined>) {
  const notices: string[] = [];
  const titles: string[] = [];
  return {
    notices,
    titles,
    ctx: {
      cwd,
      hasUI: true,
      isIdle: () => true,
      ui: {
        notify: (m: string) => notices.push(m),
        select: async (title: string, options: string[]) => {
          titles.push(title);
          return answers.shift()?.(options);
        },
      },
    } as any,
  };
}

async function setup(t: any) {
  const ctx = await knowledgeWorkspace(t);
  const projectRoot = join(ctx.root, "study-alpha");
  const state = await loadStudyState(projectRoot);
  return { ...ctx, projectRoot, state };
}

test("no arguments shows a menu whose first item resumes the next phase", async (t) => {
  const { projectRoot } = await setup(t);
  const sent: string[] = [];
  const { ctx, titles } = ui(projectRoot, [(o) => o[0]]);
  await runStudyChapter({ sendUserMessage: (m: string) => sent.push(m) } as any, "", ctx, {});
  assert.equal(titles[0], "무엇을 할까요?");
  assert.match(sent[0], /phase: diagnosis/);
});

test("picking another phase walks through a second short list", async (t) => {
  const { projectRoot } = await setup(t);
  const sent: string[] = [];
  const { ctx } = ui(projectRoot, [(o) => o.find((x) => x.includes("다른 단계"))!, (o) => o.find((x) => x.startsWith("개념"))!]);
  await runStudyChapter({ sendUserMessage: (m: string) => sent.push(m) } as any, "", ctx, {});
  assert.match(sent[0], /phase: concept/);
});

test("cancelling the menu does nothing", async (t) => {
  const { projectRoot } = await setup(t);
  const sent: string[] = [];
  await runStudyChapter({ sendUserMessage: (m: string) => sent.push(m) } as any, "", ui(projectRoot, [() => undefined]).ctx, {});
  assert.deepEqual(sent, []);
});

test("a finished chapter offers to start its review from today", async (t) => {
  const { root, projectRoot, state, a, refA } = await setup(t);
  for (const phase of ["diagnosis", "concept", "lab", "test"] as const) updatePhaseState(state, "ch-01-intro", phase, { status: "completed" });
  await saveStudyState(projectRoot, state);
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [refA] }] });
  const hooks = chapterReviewHooks(() => new Date("2026-10-31T01:00:00.000Z"));
  const { ctx, notices } = ui(projectRoot, [(o) => o.find((x) => x.includes("복습 시작"))!]);
  await runStudyChapter({ sendUserMessage() {} } as any, "", ctx, hooks);
  assert.match(notices[0], /복습 시작.*2026-11-01/);
  assert.equal((await loadSchedule(root, a.id))!.baseDate, "2026-10-31");
  assert.equal((await loadStudyState(projectRoot)).chapters["ch-01-intro"].review.status, "in_progress");
});

test("starting review without knowledge links explains the next step instead of failing silently", async (t) => {
  const { projectRoot, state } = await setup(t);
  for (const phase of ["diagnosis", "concept", "lab", "test"] as const) updatePhaseState(state, "ch-01-intro", phase, { status: "completed" });
  await saveStudyState(projectRoot, state);
  const { ctx, notices } = ui(projectRoot, [(o) => o.find((x) => x.includes("복습 시작"))!]);
  await runStudyChapter({ sendUserMessage() {} } as any, "", ctx, chapterReviewHooks());
  assert.match(notices[0], /지식 연결/);
});

test("a stale legacy HTML diagnosis can be restarted as a dialogue", async (t) => {
  const { projectRoot, state } = await setup(t);
  updatePhaseState(state, "ch-01-intro", "diagnosis", { status: "awaiting_submission", sessionId: "old" });
  await saveStudyState(projectRoot, state);
  const sent: string[] = [];
  const hooks = { ...chapterReviewHooks(), hasLiveDiagnosis: () => false };
  const { ctx } = ui(projectRoot, [(o) => o.find((x) => x.includes("대화형 진단으로 다시"))!]);
  await runStudyChapter({ sendUserMessage: (m: string) => sent.push(m) } as any, "", ctx, hooks);
  const after = (await loadStudyState(projectRoot)).chapters["ch-01-intro"].diagnosis;
  assert.equal(after.status, "not_started");
  assert.match(after.reason!, /예전 HTML 진단/);
  assert.match(sent[0], /대화형 진단 상태/);
  assert.doesNotMatch(sent[0], /제출을 기다리는 중/);
});

test("a live HTML diagnosis is not offered for restart", async (t) => {
  const { projectRoot, state } = await setup(t);
  updatePhaseState(state, "ch-01-intro", "diagnosis", { status: "awaiting_submission" });
  await saveStudyState(projectRoot, state);
  let options: string[] = [];
  const { ctx } = ui(projectRoot, [(o) => ((options = o), undefined)]);
  await runStudyChapter({ sendUserMessage() {} } as any, "", ctx, { ...chapterReviewHooks(), hasLiveDiagnosis: () => true });
  assert.ok(!options.some((x) => x.includes("대화형 진단으로 다시")));
});

test("an interrupted save is offered first and finished from the menu", async (t) => {
  const { root, projectRoot } = await setup(t);
  const { preparePlan, executePlan, listPendingPlans } = await import("../../src/workspace/change-plan.ts");
  const plan = await preparePlan(root, "r1", [{ path: "knowledge/x.md", after: "X" }]);
  await assert.rejects(executePlan(root, plan, { failAfterWrites: 0 }), /failpoint/);
  let first = "";
  const { ctx, notices } = ui(projectRoot, [(o) => ((first = o[0]), o[0])]);
  await runStudyChapter({ sendUserMessage() {} } as any, "", ctx, chapterReviewHooks());
  assert.match(first, /중단된 저장 정리/);
  assert.match(notices[0], /정리.*1/);
  assert.deepEqual(await listPendingPlans(root), []);
  const { readFile } = await import("node:fs/promises");
  assert.equal(await readFile(join(root, "knowledge", "x.md"), "utf8"), "X");
});

test("an interrupted save touched by someone else is reported, not forced", async (t) => {
  const { root, projectRoot } = await setup(t);
  const { preparePlan, executePlan } = await import("../../src/workspace/change-plan.ts");
  const { writeFile, mkdir } = await import("node:fs/promises");
  const plan = await preparePlan(root, "r1", [{ path: "knowledge/x.md", after: "X" }]);
  await assert.rejects(executePlan(root, plan, { failAfterWrites: 0 }), /failpoint/);
  await mkdir(join(root, "knowledge"), { recursive: true });
  await writeFile(join(root, "knowledge", "x.md"), "mine");
  const { ctx, notices } = ui(projectRoot, [(o) => o[0]]);
  await runStudyChapter({ sendUserMessage() {} } as any, "", ctx, chapterReviewHooks());
  assert.match(notices[0], /외부 변경/);
  assert.equal(await (await import("node:fs/promises")).readFile(join(root, "knowledge", "x.md"), "utf8"), "mine");
});
