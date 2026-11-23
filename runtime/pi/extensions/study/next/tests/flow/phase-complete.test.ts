import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPhaseComplete, conceptFiles } from "../../src/flow/phase-complete.ts";
import { saveLabManifest } from "../../src/lab/lab-core.ts";

async function chapter(readme: string, files: string[]) {
  const root = await mkdtemp(join(tmpdir(), "pc-"));
  const dir = join(root, "ch-01-a");
  await mkdir(join(dir, "concepts", "media"), { recursive: true });
  await writeFile(join(dir, "README.md"), readme);
  for (const f of files) await writeFile(join(dir, "concepts", f), "# x");
  return root;
}

const readme = (links: string[]) =>
  ["# A", "", "## 학습 목표", "- x", "", "## 개념 파일", "", ...links, "", "## 다음", ""].join("\n");

test("concept files are the sorted markdown files under concepts/", async () => {
  const root = await chapter("# A", ["02-b.md", "01-a.md", "note.txt"]);
  assert.deepEqual(await conceptFiles(root, "ch-01-a"), ["01-a.md", "02-b.md"]);
});

test("concept is complete when README lists exactly the concept files", async () => {
  const root = await chapter(
    readme(["- [3값 논리](concepts/01-a.md)", "- [NOT IN](./concepts/02-b.md)"]),
    ["01-a.md", "02-b.md"],
  );
  assert.deepEqual(await checkPhaseComplete(root, "ch-01-a", "concept"), { ok: true });
});

test("concept reports missing and extra links", async () => {
  const root = await chapter(readme(["- [a](concepts/01-a.md)", "- [z](concepts/09-z.md)"]), [
    "01-a.md",
    "02-b.md",
  ]);
  const result = await checkPhaseComplete(root, "ch-01-a", "concept");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.problems.join("\n"), /02-b\.md[\s\S]*09-z\.md/);
});

test("concept needs at least one file and the README section", async () => {
  const empty = await chapter(readme([]), []);
  assert.match(JSON.stringify(await checkPhaseComplete(empty, "ch-01-a", "concept")), /개념 파일이 없습니다/);
  const noSection = await chapter("# A\n", ["01-a.md"]);
  assert.match(JSON.stringify(await checkPhaseComplete(noSection, "ch-01-a", "concept")), /## 개념 파일/);
});

test("lab is complete only when every step passed or was skipped with evidence", async () => {
  const root = await chapter("# A", []);
  await saveLabManifest(root, {
    version: 1,
    chapterSlug: "ch-01-a",
    mode: "cli",
    steps: [
      { id: "s1", title: "a", status: "completed" },
      { id: "s2", title: "b", status: "in_progress" },
    ],
  });
  assert.match(JSON.stringify(await checkPhaseComplete(root, "ch-01-a", "lab")), /s2/);
});

test("lab without a manifest is not complete", async () => {
  const root = await chapter("# A", []);
  assert.match(JSON.stringify(await checkPhaseComplete(root, "ch-01-a", "lab")), /manifest/);
});

test("test and review use their own tools", async () => {
  const root = await chapter("# A", []);
  await assert.rejects(checkPhaseComplete(root, "ch-01-a", "test"), /study_test_finish/);
  await assert.rejects(checkPhaseComplete(root, "ch-01-a", "review"), /study_review_finish/);
});
