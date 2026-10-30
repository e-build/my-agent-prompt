import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildChapterMenu,
  chapterArgumentCompletions,
  parsePhase,
  readChapterCatalog,
} from "../../src/session/chapter-catalog.ts";
import { parseStudyChapterArgs } from "../../src/session/study-command.ts";
import { createEmptyChapterState, saveStudyState } from "../../src/session/study-state.ts";

async function project() {
  const root = join(await mkdtemp(join(tmpdir(), "catalog-")), "study-pool");
  for (const [slug, title] of [["ch-01-basics", "동시성과 풀링 기초"], ["ch-02-cost", "스레드 생성 비용"]]) {
    await mkdir(join(root, slug), { recursive: true });
    await writeFile(join(root, slug, "README.md"), `# Ch ${slug.slice(3, 5)} — ${title}\n`);
  }
  const ch1 = createEmptyChapterState();
  ch1.diagnosis.status = "completed";
  ch1.concept.status = "in_progress";
  await saveStudyState(root, {
    version: 1,
    projectRoot: root,
    createdAt: "x",
    updatedAt: "x",
    activeChapter: "ch-01-basics",
    activePhase: "concept",
    chapters: { "ch-01-basics": ch1, "ch-02-cost": createEmptyChapterState() },
  });
  return root;
}

test("Korean and English phase names are both accepted", () => {
  assert.equal(parsePhase("개념"), "concept");
  assert.equal(parsePhase("개념학습"), "concept");
  assert.equal(parsePhase("concept"), "concept");
  assert.equal(parsePhase("시험"), "test");
  assert.equal(parsePhase("실습"), "lab");
  assert.equal(parsePhase("모름"), undefined);
  assert.deepEqual(parseStudyChapterArgs("01 개념"), { chapterArg: "01", phaseArg: "concept" });
  assert.deepEqual(parseStudyChapterArgs("복습"), { phaseArg: "review" });
  assert.throws(() => parseStudyChapterArgs("01 nope"), /진단\|개념\|실습\|시험\|복습/);
});

test("the catalog is read-only and shows titles, statuses and the next phase", async () => {
  const root = await project();
  const catalog = await readChapterCatalog(root);
  assert.deepEqual(
    catalog.chapters.map((c) => [c.number, c.title, c.next, c.active]),
    [["01", "동시성과 풀링 기초", "concept", true], ["02", "스레드 생성 비용", "diagnosis", false]],
  );
  const missing = await readChapterCatalog(join(root, "..", "nowhere"));
  assert.deepEqual(missing.chapters, []);
});

test("completions list chapters first, then phases with the next one marked", async () => {
  const catalog = await readChapterCatalog(await project());
  const chapters = chapterArgumentCompletions(catalog, "")!;
  assert.deepEqual(chapters.map((c) => c.value), ["01", "02"]);
  assert.match(chapters[0].label, /동시성과 풀링 기초/);
  assert.match(chapters[0].description!, /개념 학습 진행 중/);
  assert.deepEqual(chapterArgumentCompletions(catalog, "0")!.map((c) => c.value), ["01", "02"]);
  assert.deepEqual(chapterArgumentCompletions(catalog, "02")!.map((c) => c.value), ["02"]);
  const phases = chapterArgumentCompletions(catalog, "01 ")!;
  assert.equal(phases[0].value, "01 개념");
  assert.match(phases[0].description!, /다음 단계/);
  assert.equal(phases.length, 5);
  assert.deepEqual(chapterArgumentCompletions(catalog, "01 시")!.map((c) => c.value), ["01 시험"]);
  assert.equal(chapterArgumentCompletions(catalog, "99 "), null);
  assert.equal(chapterArgumentCompletions(catalog, "01 개념 x"), null);
});

test("the menu starts with the recommended resume and adds context actions", async () => {
  const root = await project();
  const catalog = await readChapterCatalog(root);
  const menu = buildChapterMenu(catalog, { registered: false, staleDiagnosis: () => false });
  assert.match(menu[0].label, /이어서.*01.*개념 학습/);
  assert.deepEqual(menu[0].action, { type: "open", chapterSlug: "ch-01-basics", phase: "concept" });
  assert.ok(menu.some((m) => m.action.type === "pick-chapter" && m.label === "챕터 고르기"));
  assert.ok(menu.some((m) => m.action.type === "pick-phase"));
  assert.ok(!menu.some((m) => m.action.type === "start-review"));

  catalog.chapters[1].phases.diagnosis = "awaiting_submission";
  const stale = buildChapterMenu(catalog, { registered: true, staleDiagnosis: (slug) => slug === "ch-02-cost" });
  assert.ok(stale.some((m) => m.action.type === "restart-diagnosis" && m.action.chapterSlug === "ch-02-cost"));

  catalog.chapters[0].phases.test = "completed";
  catalog.chapters[0].phases.review = "not_started";
  const review = buildChapterMenu(catalog, { registered: true, staleDiagnosis: () => false });
  assert.ok(review.some((m) => m.action.type === "start-review" && m.action.chapterSlug === "ch-01-basics"));
  catalog.chapters[0].phases.review = "skipped_understood";
  assert.ok(!buildChapterMenu(catalog, { registered: true, staleDiagnosis: () => false }).some((m) => m.action.type === "start-review"));
});

test("titles drop a repeated chapter prefix and finished projects get no resume item", async () => {
  const root = join(await mkdtemp(join(tmpdir(), "catalog-done-")), "study-x");
  await mkdir(join(root, "ch-01-a"), { recursive: true });
  await writeFile(join(root, "ch-01-a", "README.md"), "# ch-01 동시성 기초\n");
  await mkdir(join(root, "ch-02-b"), { recursive: true });
  await writeFile(join(root, "ch-02-b", "README.md"), "# Ch 02: 큐\n");
  const finished = createEmptyChapterState();
  for (const phase of ["diagnosis", "concept", "lab", "test", "review"] as const) finished[phase].status = "skipped_understood";
  const tested = createEmptyChapterState();
  for (const phase of ["diagnosis", "concept", "lab", "test"] as const) tested[phase].status = "completed";
  await saveStudyState(root, { version: 1, projectRoot: root, createdAt: "x", updatedAt: "x", chapters: { "ch-01-a": tested, "ch-02-b": finished } });
  const catalog = await readChapterCatalog(root);
  assert.deepEqual(catalog.chapters.map((c) => c.title), ["동시성 기초", "큐"]);
  const menu = buildChapterMenu(catalog, { registered: true, staleDiagnosis: () => false });
  assert.ok(!menu.some((m) => m.label.startsWith("▶")));
  assert.ok(menu.some((m) => m.action.type === "start-review" && m.action.chapterSlug === "ch-01-a"));
  assert.ok(!menu.some((m) => m.action.type === "pick-phase" && m.action.chapterSlug === "ch-02-b"));
});
