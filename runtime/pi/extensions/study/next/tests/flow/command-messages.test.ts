import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chapterMessage,
  initMessage,
  resolveChapterTarget,
  reviewMessage,
} from "../../src/flow/command-messages.ts";
import { enroll } from "../../src/review/schedule.ts";
import { loadStudyState, setPhase } from "../../src/state/study-state.ts";
import { saveProjectManifest } from "../../src/state/project-manifest.ts";
import { workspaceFixture, tempDir } from "../support/fixtures.ts";

const defaults = new URL("../../prompts/", import.meta.url).pathname;

test("init needs a topic and fills it in", async (t) => {
  const dir = await tempDir(t);
  await assert.rejects(initMessage(dir, "  ", defaults), /사용법/);
  const text = await initMessage(dir, "ANSI SQL", defaults);
  assert.match(text, /학습 주제: \*\*ANSI SQL\*\*/);
  assert.doesNotMatch(text, /\{\{topic\}\}/);
});

test("init uses a study-root override", async (t) => {
  const root = await workspaceFixture(t);
  await mkdir(join(root, ".study", "prompts"), { recursive: true });
  await writeFile(join(root, ".study", "prompts", "init.md"), "내 init: {{topic}}");
  assert.equal(await initMessage(root, "X", defaults), "내 init: X");
});

test("chapter target defaults to the next phase and accepts explicit ones", async (t) => {
  const root = await workspaceFixture(t);
  const project = join(root, "study-alpha");
  assert.deepEqual(await resolveChapterTarget(project, ""), {
    projectRoot: project,
    chapterSlug: "ch-01-intro",
    phase: "concept",
  });
  assert.equal((await resolveChapterTarget(project, "01 시험")).phase, "test");
});

test("concept message marks the phase started and carries header, placement, prompt and template", async (t) => {
  const root = await workspaceFixture(t, { channel: "plannotator" });
  const project = join(root, "study-alpha");
  await saveProjectManifest(project, {
    version: 1,
    projectSlug: "study-alpha",
    topic: "Alpha",
    chapters: {},
    placement: {
      reason: "route_decided",
      summary: "s",
      startAt: "a",
      focus: [],
      skip: [],
      unverified: [],
      questionCount: 1,
      chapters: { "ch-01-intro": { startAt: "기초부터", skip: [], focus: [], unverified: ["X"] } },
    },
  });
  const text = await chapterMessage({ projectRoot: project, chapterSlug: "ch-01-intro", phase: "concept" }, defaults);
  assert.match(text, /^# STUDY_PHASE_REQUEST/);
  assert.match(text, /- chapterTitle: Intro/);
  assert.match(text, /- channel: plannotator/);
  assert.match(text, /- 미확인: X/);
  assert.match(text, /# 개념 학습/);
  assert.match(text, /## 부록: templates\/concept-page/);
  assert.equal((await loadStudyState(project)).chapters["ch-01-intro"].concept.status, "in_progress");
});

test("a project override replaces only that phase's body", async (t) => {
  const root = await workspaceFixture(t);
  const project = join(root, "study-alpha");
  await mkdir(join(project, ".study", "prompts"), { recursive: true });
  await writeFile(join(project, ".study", "prompts", "lab.md"), "내 실습 지침");
  const text = await chapterMessage({ projectRoot: project, chapterSlug: "ch-01-intro", phase: "lab" }, defaults);
  assert.match(text, /- phase: lab/);
  assert.ok(text.trimEnd().endsWith("내 실습 지침"));
});

test("a retest shows the last attempt and keeps it on the state", async (t) => {
  const root = await workspaceFixture(t);
  const project = join(root, "study-alpha");
  await loadStudyState(project);
  await setPhase(project, "ch-01-intro", "test", "relearn_required", { attempt: 1, score: 2, maxScore: 6 });
  const text = await chapterMessage({ projectRoot: project, chapterSlug: "ch-01-intro", phase: "test" }, defaults);
  assert.match(text, /- 지난 attempt: 1 \(2\/6\)/);
  const test1 = (await loadStudyState(project)).chapters["ch-01-intro"].test;
  assert.deepEqual([test1.status, test1.attempt], ["in_progress", 1]);
});

test("review lists today's due chapters before the review prompt", async (t) => {
  const root = await workspaceFixture(t);
  await enroll(root, { projectSlug: "study-alpha", chapterSlug: "ch-01-intro" }, "2026-01-01", [1]);
  const text = await reviewMessage(join(root, "study-alpha"), defaults);
  assert.match(text, /^# STUDY_REVIEW_REQUEST/);
  assert.match(text, /study-alpha \/ ch-01-intro/);
  assert.match(text, /# 챕터 복습/);
});

test("review needs a study root", async (t) => {
  await assert.rejects(reviewMessage(await tempDir(t), defaults), /study 루트/);
});

test("the review phase from /study-chapter becomes a chapter-scoped review request", async (t) => {
  const root = await workspaceFixture(t);
  const text = await chapterMessage(
    { projectRoot: join(root, "study-alpha"), chapterSlug: "ch-01-intro", phase: "review" },
    defaults,
  );
  assert.match(text, /# STUDY_REVIEW_REQUEST/);
});
