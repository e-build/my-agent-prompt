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
} from "../../src/ui/chapter-catalog.ts";

async function project(state?: unknown) {
  const root = await mkdtemp(join(tmpdir(), "cat-"));
  await mkdir(join(root, ".study"));
  for (const [slug, title] of [["ch-01-a", "NULL"], ["ch-02-b", "JOIN"]]) {
    await mkdir(join(root, slug));
    await writeFile(join(root, slug, "README.md"), `# ${title}\n`);
  }
  if (state) await writeFile(join(root, ".study", "state.json"), JSON.stringify(state));
  return root;
}

const phases = (concept: string, lab = "not_started", t = "not_started", review = "not_started") => ({
  concept: { status: concept },
  lab: { status: lab },
  test: { status: t },
  review: { status: review },
});

test("phase arguments accept Korean names and reject diagnosis", () => {
  assert.equal(parsePhase("개념"), "concept");
  assert.equal(parsePhase("시험"), "test");
  assert.equal(parsePhase("진단"), undefined);
  assert.equal(parsePhase("diagnosis"), undefined);
});

test("the catalog reads titles and the next phase without writing state", async () => {
  const root = await project({
    version: 1,
    activeChapter: "ch-01-a",
    chapters: { "ch-01-a": { diagnosis: { status: "completed" }, ...phases("completed") } },
  });
  const catalog = await readChapterCatalog(root);
  assert.deepEqual(
    catalog.chapters.map((c) => [c.number, c.title, c.next, c.active]),
    [
      ["01", "NULL", "lab", true],
      ["02", "JOIN", "concept", false],
    ],
  );
});

test("legacy awaiting statuses read as in progress", async () => {
  const root = await project({
    version: 1,
    chapters: { "ch-01-a": phases("completed", "completed", "awaiting_review") },
  });
  assert.equal((await readChapterCatalog(root)).chapters[0].phases.test, "in_progress");
});

test("completions list chapters, then phases with the next one first", async () => {
  const catalog = await readChapterCatalog(
    await project({ version: 1, chapters: { "ch-01-a": phases("completed") } }),
  );
  assert.deepEqual(chapterArgumentCompletions(catalog, "")?.map((c) => c.value), ["01", "02"]);
  assert.deepEqual(chapterArgumentCompletions(catalog, "01 ")?.map((c) => c.value), [
    "01 실습",
    "01 개념",
    "01 시험",
    "01 복습",
  ]);
});

test("the menu offers due reviews, resume, other phases and chapter choice", async () => {
  const catalog = await readChapterCatalog(
    await project({ version: 1, activeChapter: "ch-01-a", chapters: { "ch-01-a": phases("completed") } }),
  );
  assert.deepEqual(
    buildChapterMenu(catalog, { dueReviews: 2 }).map((m) => m.action.type),
    ["review", "open", "pick-phase", "pick-chapter"],
  );
  assert.equal(buildChapterMenu(catalog, { dueReviews: 0 })[0].label, "▶ 이어서: 01 NULL — 프로젝트 실습");
});

test("a chapter waiting only for review is not offered as resume", async () => {
  const catalog = await readChapterCatalog(
    await project({
      version: 1,
      chapters: {
        "ch-01-a": phases("completed", "completed", "completed", "in_progress"),
        "ch-02-b": phases("not_started"),
      },
    }),
  );
  const open = buildChapterMenu(catalog, { dueReviews: 0 }).find((m) => m.action.type === "open");
  assert.deepEqual(open?.action, { type: "open", chapterSlug: "ch-02-b", phase: "concept" });
});
