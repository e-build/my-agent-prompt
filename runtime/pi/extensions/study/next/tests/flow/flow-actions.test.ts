import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAnswer, createCard } from "../../src/cards/card-store.ts";
import {
  approveProject,
  completePhase,
  finishPlacement,
  finishReview,
  finishTest,
  reviewNext,
} from "../../src/flow/flow-actions.ts";
import { loadSchedule, enroll } from "../../src/review/schedule.ts";
import { initWorkspace, registerProject } from "../../src/review/workspace.ts";
import { loadProjectManifest } from "../../src/state/project-manifest.ts";
import { loadStudyState } from "../../src/state/study-state.ts";
import type { QuestionCard } from "../../src/channel/channel.ts";

async function setup({ workspace = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "flow-"));
  if (workspace) await initWorkspace(root);
  const projectRoot = join(root, "study-x");
  await mkdir(join(projectRoot, "ch-01-a"), { recursive: true });
  await mkdir(join(projectRoot, "ch-02-b"), { recursive: true });
  return { root, projectRoot };
}

const placementCard = (id: string): QuestionCard => ({
  kind: "question",
  id,
  projectSlug: "study-x",
  purpose: "placement",
  askConfidence: true,
  items: [{ id: "q1", prompt: "?" }],
});
const criteria = { q1: { answer: "a", rubric: "r" } };

test("approveProject writes the manifest, registers the project and creates chapter state", async () => {
  const { root, projectRoot } = await setup();
  const message = await approveProject(projectRoot, {
    projectSlug: "study-x",
    topic: "X",
    chapters: { "ch-01-a": { title: "A" }, "ch-02-b": { title: "B", lab: { mode: "cli" } } },
  });
  assert.match(message, /등록/);
  assert.equal((await loadProjectManifest(projectRoot))?.chapters["ch-02-b"].lab?.mode, "cli");
  const ws = JSON.parse(await readFile(join(root, ".study", "workspace.json"), "utf8"));
  assert.deepEqual(ws.projects.map((p: { slug: string }) => p.slug), ["study-x"]);
  assert.deepEqual(Object.keys((await loadStudyState(projectRoot)).chapters), ["ch-01-a", "ch-02-b"]);
});

test("approveProject creates a study root in the parent when none exists", async () => {
  const { root, projectRoot } = await setup({ workspace: false });
  await approveProject(projectRoot, { projectSlug: "study-x", topic: "X", chapters: {} });
  assert.ok(JSON.parse(await readFile(join(root, ".study", "workspace.json"), "utf8")).timezone);
});

test("approveProject keeps an existing placement", async () => {
  const { projectRoot } = await setup();
  await finishPlacement(projectRoot, {
    reason: "route_decided",
    summary: "s",
    startAt: "ch-01",
    chapters: {},
  });
  await approveProject(projectRoot, { projectSlug: "study-x", topic: "X", chapters: {} });
  assert.equal((await loadProjectManifest(projectRoot))?.placement?.summary, "s");
});

test("finishPlacement counts placement questions and enforces the 8-question limit", async () => {
  const { projectRoot } = await setup();
  for (let i = 1; i <= 9; i++) await createCard(projectRoot, placementCard(`c-p${i}`), criteria);
  await assert.rejects(
    finishPlacement(projectRoot, { reason: "route_decided", summary: "s", startAt: "a" }),
    /9.*8/,
  );
  await finishPlacement(projectRoot, { reason: "limit_reached", summary: "s", startAt: "a" });
  assert.equal((await loadProjectManifest(projectRoot))?.placement?.questionCount, 9);
});

test("finishPlacement works before the manifest exists and returns the answer review", async () => {
  const { projectRoot } = await setup();
  await createCard(projectRoot, placementCard("c-p1"), criteria);
  await appendAnswer(projectRoot, "placement", {
    cardId: "c-p1",
    itemId: "q1",
    response: "내 답",
    confidence: 0.7,
    assistance: "independent",
    result: "incorrect",
    reason: "r",
  });
  const message = await finishPlacement(projectRoot, {
    reason: "route_decided",
    summary: "s",
    startAt: "a",
    chapters: { "ch-01-a": { startAt: "x", unverified: ["COUNT"] } },
  });
  assert.match(message, /## 답 대조/);
  assert.match(message, /내 답[\s\S]*확신도 7[\s\S]*incorrect[\s\S]*정답: a/);
  assert.deepEqual(
    (await loadProjectManifest(projectRoot))?.placement?.chapters["ch-01-a"].unverified,
    ["COUNT"],
  );
});

test("completePhase marks concept done only when the check passes", async () => {
  const { projectRoot } = await setup();
  await assert.rejects(completePhase(projectRoot, "ch-01-a", "concept"), /개념 파일/);
  await mkdir(join(projectRoot, "ch-01-a", "concepts"));
  await writeFile(join(projectRoot, "ch-01-a", "concepts", "01-x.md"), "# x");
  await writeFile(join(projectRoot, "ch-01-a", "README.md"), "# A\n\n## 개념 파일\n\n- [x](concepts/01-x.md)\n");
  assert.match(await completePhase(projectRoot, "ch-01-a", "concept"), /다음: 실습/);
  assert.equal((await loadStudyState(projectRoot)).chapters["ch-01-a"].concept.status, "completed");
});

async function testCard(projectRoot: string, id: string, scores: number[]) {
  const card: QuestionCard = {
    kind: "question",
    id,
    projectSlug: "study-x",
    chapterSlug: "ch-01-a",
    purpose: "test",
    askConfidence: false,
    items: scores.map((_, i) => ({ id: `q${i + 1}`, prompt: "?", maxScore: 2 })),
  };
  await createCard(
    projectRoot,
    card,
    Object.fromEntries(card.items.map((item) => [item.id, { answer: "a", rubric: "r" }])),
  );
  for (const [i, score] of scores.entries())
    await appendAnswer(projectRoot, "ch-01-a", {
      cardId: id,
      itemId: `q${i + 1}`,
      response: "x",
      assistance: "independent",
      result: score === 2 ? "demonstrated" : "partial",
      score,
      reason: "r",
    });
}

test("finishTest passing completes the test and enrolls the chapter for review", async () => {
  const { root, projectRoot } = await setup();
  await testCard(projectRoot, "c-t1", [2, 2, 1]);
  const message = await finishTest(projectRoot, { chapterSlug: "ch-01-a", cardId: "c-t1", passScore: 4 }, "2026-11-23");
  assert.match(message, /통과 5\/6/);
  assert.match(message, /2026-11-24/);
  const state = await loadStudyState(projectRoot);
  assert.equal(state.chapters["ch-01-a"].test.status, "completed");
  assert.equal(state.chapters["ch-01-a"].review.status, "in_progress");
  assert.equal((await loadSchedule(root)).entries[0].chapterSlug, "ch-01-a");
});

test("finishTest failing marks relearn with the weak items and the next attempt", async () => {
  const { root, projectRoot } = await setup();
  await testCard(projectRoot, "c-t1", [2, 0, 0]);
  const message = await finishTest(projectRoot, { chapterSlug: "ch-01-a", cardId: "c-t1", passScore: 4 }, "2026-11-23");
  assert.match(message, /미통과 2\/6/);
  assert.match(message, /q2, q3/);
  assert.match(message, /attempt 2/);
  const state = await loadStudyState(projectRoot);
  assert.equal(state.chapters["ch-01-a"].test.status, "relearn_required");
  assert.equal(state.chapters["ch-01-a"].test.attempt, 1);
  assert.equal((await loadSchedule(root)).entries.length, 0);
});

test("finishTest without a study root still completes but says review is not scheduled", async () => {
  const { projectRoot } = await setup({ workspace: false });
  await testCard(projectRoot, "c-t1", [2, 2]);
  const message = await finishTest(projectRoot, { chapterSlug: "ch-01-a", cardId: "c-t1", passScore: 3 }, "2026-11-23");
  assert.match(message, /study 루트가 없어/);
});

test("reviewNext lists due chapters with their concept files and last weak items", async () => {
  const { root, projectRoot } = await setup();
  await mkdir(join(projectRoot, "ch-01-a", "concepts"));
  await writeFile(join(projectRoot, "ch-01-a", "concepts", "01-x.md"), "# x");
  await testCard(projectRoot, "c-t1", [2, 1]);
  await registerProject(root, { slug: "study-x", path: "study-x" });
  await enroll(root, { projectSlug: "study-x", chapterSlug: "ch-01-a" }, "2026-11-20", [1, 3]);
  const text = await reviewNext(root, "2026-11-23");
  assert.match(text, /study-x \/ ch-01-a .*2026-11-21/);
  assert.match(text, /concepts\/01-x\.md/);
  assert.match(text, /지난 시험 약점: q2/);
  assert.doesNotMatch(text, /rubric|answer/);
  assert.match(await reviewNext(root, "2026-11-20"), /할 복습이 없습니다\. 다음 예정일: 2026-11-21/);
});

test("finishReview advances only when every item was independent and demonstrated", async () => {
  const { root, projectRoot } = await setup();
  await enroll(root, { projectSlug: "study-x", chapterSlug: "ch-01-a" }, "2026-11-20", [1, 3, 7]);
  const reviewCard: QuestionCard = {
    kind: "question",
    id: "c-r1",
    projectSlug: "study-x",
    chapterSlug: "ch-01-a",
    purpose: "review",
    askConfidence: true,
    items: [{ id: "q1", prompt: "?" }, { id: "q2", prompt: "?" }],
  };
  await createCard(projectRoot, reviewCard, { q1: { answer: "a", rubric: "r" }, q2: { answer: "b", rubric: "r" } });
  const base = { cardId: "c-r1", response: "x", reason: "r" };
  await appendAnswer(projectRoot, "ch-01-a", { ...base, itemId: "q1", assistance: "independent", result: "demonstrated" });
  await assert.rejects(finishReview(projectRoot, { chapterSlug: "ch-01-a", cardId: "c-r1" }, "2026-11-21"), /q2/);
  await appendAnswer(projectRoot, "ch-01-a", { ...base, itemId: "q2", assistance: "hinted", result: "demonstrated" });
  const message = await finishReview(projectRoot, { chapterSlug: "ch-01-a", cardId: "c-r1" }, "2026-11-21");
  assert.match(message, /처음 간격부터/);
  assert.match(message, /2026-11-22/);
});

test("finishReview finishing the last round completes the review phase", async () => {
  const { root, projectRoot } = await setup();
  const wsFile = join(root, ".study", "workspace.json");
  const ws = JSON.parse(await readFile(wsFile, "utf8"));
  await writeFile(wsFile, JSON.stringify({ ...ws, review: { intervals: [1] } }));
  await enroll(root, { projectSlug: "study-x", chapterSlug: "ch-01-a" }, "2026-11-20", [1]);
  await createCard(projectRoot, {
    kind: "question",
    id: "c-r2",
    projectSlug: "study-x",
    chapterSlug: "ch-01-a",
    purpose: "review",
    askConfidence: false,
    items: [{ id: "q1", prompt: "?" }],
  }, criteria);
  await appendAnswer(projectRoot, "ch-01-a", {
    cardId: "c-r2", itemId: "q1", response: "x", reason: "r", assistance: "independent", result: "demonstrated",
  });
  assert.match(await finishReview(projectRoot, { chapterSlug: "ch-01-a", cardId: "c-r2" }, "2026-11-21"), /복습을 마쳤습니다/);
  assert.equal((await loadStudyState(projectRoot)).chapters["ch-01-a"].review.status, "completed");
});
