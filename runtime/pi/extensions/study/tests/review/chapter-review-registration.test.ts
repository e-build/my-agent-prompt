import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { completeAcknowledgedTest } from "../../src/assessment/test-completion.ts";
import { updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { registerChapterReviews } from "../../src/review/chapter-review-registration.ts";
import { loadSchedule } from "../../src/review/review-store.ts";
import { loadStudyState } from "../../src/session/study-state.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";

async function chapterReady(root: string) {
  const chapter = join(root, "study-alpha", "ch-01-intro");
  await mkdir(join(chapter, "lab"), { recursive: true });
  await writeFile(join(chapter, "README.md"), "# Intro\n## 개념 학습 노트\n내용\n");
  await writeFile(join(chapter, "test.md"), "## Attempt 1\nPASSED\n");
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "s1", status: "completed" }] }));
  await writeFile(join(chapter, "lab", "results.md"), "- Step ID: `s1`\n");
}

const record = { id: "t1", attempt: 1, score: 9, maxScore: 10 };
const now = () => new Date("2026-10-01T05:00:00.000Z");

test("an acknowledged passed test schedules the chapter's bound knowledge from the completion day", async (t) => {
  const { root, a, b, refA, refB } = await knowledgeWorkspace(t);
  await chapterReady(root);
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [refA, refB] }] });
  const projectRoot = join(root, "study-alpha");
  const result = await completeAcknowledgedTest(projectRoot, "ch-01-intro", record, true, { now });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.review?.created.sort(), [a.id, b.id].sort());
  assert.equal((await loadSchedule(root, a.id))!.dueDate, "2026-10-02");
  assert.equal((await loadSchedule(root, a.id))!.baseDate, "2026-10-01");
  const state = await loadStudyState(projectRoot);
  assert.equal(state.chapters["ch-01-intro"].test.status, "completed");
  assert.equal((state as any).chapterCompletions["ch-01-intro"].completedOn, "2026-10-01");

  const retry = await completeAcknowledgedTest(projectRoot, "ch-01-intro", record, true, { now: () => new Date("2026-10-09T00:00:00.000Z") });
  assert.deepEqual(retry.review?.created, []);
  assert.equal((await loadSchedule(root, a.id))!.dueDate, "2026-10-02");
  assert.equal((await loadStudyState(projectRoot) as any).chapterCompletions["ch-01-intro"].completedOn, "2026-10-01");
});

test("a chapter without bindings completes the test and reports pending linking", async (t) => {
  const { root } = await knowledgeWorkspace(t);
  await chapterReady(root);
  const result = await completeAcknowledgedTest(join(root, "study-alpha"), "ch-01-intro", record, true, { now });
  assert.equal(result.status, "completed");
  assert.match(result.reviewWarning!, /지식 연결/);
});

test("a failing test or missing evidence never schedules reviews", async (t) => {
  const { root, a, refA } = await knowledgeWorkspace(t);
  await chapterReady(root);
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [refA] }] });
  const projectRoot = join(root, "study-alpha");
  await completeAcknowledgedTest(projectRoot, "ch-01-intro", record, false, { now });
  assert.equal(await loadSchedule(root, a.id), null);
  await writeFile(join(projectRoot, "ch-01-intro", "lab", "results.md"), "다른 기록\n");
  const blocked = await completeAcknowledgedTest(projectRoot, "ch-01-intro", record, true, { now });
  assert.equal(blocked.status, "blocked");
  assert.equal(await loadSchedule(root, a.id), null);
});

test("unregistered projects keep the legacy review page flow and create no root files", async (t) => {
  const { tempDir } = await import("../support/workspace-fixture.ts");
  const base = await tempDir(t);
  const projectRoot = join(base, "study-legacy");
  const chapter = join(projectRoot, "ch-01-intro");
  await mkdir(join(chapter, "lab"), { recursive: true });
  await writeFile(join(chapter, "README.md"), "# Intro\n## 개념 학습 노트\n내용\n");
  await writeFile(join(chapter, "test.md"), "PASSED\n");
  await writeFile(join(chapter, "lab", "manifest.json"), JSON.stringify({ steps: [{ id: "s1", status: "completed" }] }));
  await writeFile(join(chapter, "lab", "results.md"), "- Step ID: `s1`\n");
  const result = await completeAcknowledgedTest(projectRoot, "ch-01-intro", record, true, { now });
  assert.equal(result.status, "completed");
  assert.ok(result.pagePath);
  assert.equal(result.review, undefined);
  assert.match(await readFile(result.pagePath!, "utf8"), /복습 시작/);
});

test("explicit registration for an approved skip uses the same helper", async (t) => {
  const { root, a, refA } = await knowledgeWorkspace(t);
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [refA] }] });
  const out = await registerChapterReviews(root, "study-alpha", "ch-01-intro", "2026-10-05");
  assert.deepEqual(out.created, [a.id]);
});
