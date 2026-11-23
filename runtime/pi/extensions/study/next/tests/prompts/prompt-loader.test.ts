import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PROMPT_NAMES, listPromptSources, loadPrompt } from "../../src/prompts/prompt-loader.ts";

async function layout() {
  const base = await mkdtemp(join(tmpdir(), "prompts-"));
  const defaults = join(base, "defaults");
  const root = join(base, "root");
  const project = join(root, "proj");
  for (const dir of [join(root, ".study", "prompts"), join(project, ".study", "prompts")])
    await mkdir(dir, { recursive: true });
  for (const name of PROMPT_NAMES) {
    const path = join(defaults, `${name}.md`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `default ${name}`);
  }
  return { defaults, root, project };
}

test("project beats root beats default", async () => {
  const l = await layout();
  assert.deepEqual(await loadPrompt("lab", l), {
    text: "default lab",
    source: "default",
    warnings: [],
  });
  await writeFile(join(l.root, ".study", "prompts", "lab.md"), "root lab");
  assert.deepEqual(await loadPrompt("lab", l), { text: "root lab", source: "root", warnings: [] });
  await writeFile(join(l.project, ".study", "prompts", "lab.md"), "project lab");
  assert.equal((await loadPrompt("lab", l)).source, "project");
});

test("layers are optional when no study root or project is known", async () => {
  const l = await layout();
  assert.equal((await loadPrompt("init", { defaults: l.defaults })).source, "default");
});

test("an unreadable override falls back to the next layer with a warning", async () => {
  const l = await layout();
  await mkdir(join(l.project, ".study", "prompts", "lab.md"));
  const loaded = await loadPrompt("lab", l);
  assert.equal(loaded.source, "default");
  assert.match(loaded.warnings[0], /lab\.md/);
});

test("a missing default is an error, never a one-line stand-in", async () => {
  const l = await layout();
  await assert.rejects(
    loadPrompt("lab", { ...l, defaults: join(l.defaults, "nope") }),
    /기본 지침이 없습니다: lab\.md/,
  );
});

test("{{topic}} is replaced only when a topic is given", async () => {
  const l = await layout();
  await writeFile(join(l.defaults, "init.md"), "주제: {{topic}} / {{other}}");
  assert.equal((await loadPrompt("init", l, { topic: "SQL" })).text, "주제: SQL / {{other}}");
  assert.equal((await loadPrompt("init", l)).text, "주제: {{topic}} / {{other}}");
});

test("listPromptSources reports each name's layer and whether it differs from default", async () => {
  const l = await layout();
  await writeFile(join(l.root, ".study", "prompts", "test.md"), "mine");
  const rows = await listPromptSources(l);
  assert.deepEqual(
    rows.find((r) => r.name === "test"),
    { name: "test", source: "root", differs: true },
  );
  assert.deepEqual(
    rows.find((r) => r.name === "lab"),
    { name: "lab", source: "default", differs: false },
  );
  assert.equal(rows.length, PROMPT_NAMES.length);
});

test("templates live under templates/", () => {
  assert.ok(PROMPT_NAMES.includes("templates/concept-page"));
  assert.ok(PROMPT_NAMES.includes("templates/chapter-readme"));
});
