import { test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeCurriculumArtifacts } from "./curriculum-core.ts";
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = await mkdtemp(join(tmpdir(), "study-curriculum-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  return base;
}
const params = {
  projectSlug: "study-cache",
  topic: "Cache",
  curriculumJson: JSON.stringify({
    projectSlug: "study-cache",
    phases: [{ chapters: [{ slug: "ch-01-cache", title: "Cache" }] }],
  }),
};
const template = "<h1>{{PROJECT_SLUG}}</h1><h2>{{TOPIC}}</h2><script>{{CURRICULUM_JSON}}</script>";

test("curriculum writer keeps HTML and manifest at one root on repeated nested calls", async (t) => {
  const write = writeCurriculumArtifacts;
  const base = await fixture(t);
  const root = join(base, params.projectSlug);
  const chapter = join(root, "ch-01-cache");
  const app = join(root, "app");
  await mkdir(chapter, { recursive: true });
  await mkdir(app);
  for (const cwd of [root, chapter, app]) {
    const result = await write(cwd, params, template);
    assert.equal(result.projectRoot, root);
    assert.equal(result.htmlPath, join(root, "curriculum.html"));
    assert.ok((await readFile(result.htmlPath, "utf8")).includes(params.curriculumJson));
    assert.equal(
      JSON.parse(await readFile(join(root, ".study", "project.json"), "utf8")).projectSlug,
      params.projectSlug,
    );
    await assert.rejects(access(join(cwd, params.projectSlug)), { code: "ENOENT" });
  }
});

test("curriculum writer creates artifacts at an explicit root", async (t) => {
  const write = writeCurriculumArtifacts;
  const base = await fixture(t);
  const root = join(base, params.projectSlug);
  const result = await write(base, { ...params, projectRoot: root }, template);
  assert.equal(result.projectRoot, root);
  await access(join(root, "curriculum.html"));
  await access(join(root, ".study", "project.json"));
});

test("payload slug mismatch fails before any artifact is created", async (t) => {
  const write = writeCurriculumArtifacts;
  const base = await fixture(t);
  await assert.rejects(
    write(
      base,
      { ...params, curriculumJson: JSON.stringify({ projectSlug: "study-other" }) },
      template,
    ),
    /일치/,
  );
  await assert.rejects(access(join(base, params.projectSlug)), { code: "ENOENT" });
});

test("invalid curriculum JSON fails before any artifact is created", async (t) => {
  const write = writeCurriculumArtifacts;
  const base = await fixture(t);
  await assert.rejects(write(base, { ...params, curriculumJson: "{bad" }, template), /JSON/);
  await assert.rejects(access(join(base, params.projectSlug)), { code: "ENOENT" });
});

test("invalid root fails before any artifact is created", async (t) => {
  const write = writeCurriculumArtifacts;
  const base = await fixture(t);
  await assert.rejects(
    write(base, { ...params, projectRoot: join(base, "study-other") }, template),
    /일치/,
  );
  await assert.rejects(access(join(base, "study-other")), { code: "ENOENT" });
});

test("curriculum writer escapes HTML titles without changing payload JSON", async (t) => {
  const write = writeCurriculumArtifacts;
  const base = await fixture(t);
  const result = await write(base, { ...params, topic: '<Cache & "queue">' }, template);
  const html = await readFile(result.htmlPath, "utf8");
  assert.ok(html.includes("&lt;Cache &amp; &quot;queue&quot;&gt;"));
  assert.ok(html.includes(params.curriculumJson));
});
