import { test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  diffPrompt,
  ejectPrompt,
  overridePath,
  resetPrompt,
} from "../../src/prompts/prompt-commands.ts";

async function layout() {
  const base = await mkdtemp(join(tmpdir(), "pc-"));
  const defaults = join(base, "d");
  await mkdir(join(defaults, "templates"), { recursive: true });
  await writeFile(join(defaults, "lab.md"), "a\nb\n");
  await writeFile(join(defaults, "templates", "concept-page.md"), "t\n");
  return { defaults, root: join(base, "r"), project: join(base, "r", "p") };
}

test("eject copies the default to root or project and refuses to overwrite", async () => {
  const l = await layout();
  const path = await ejectPrompt("lab", l, "root");
  assert.equal(path, join(l.root, ".study", "prompts", "lab.md"));
  assert.equal(await readFile(path, "utf8"), "a\nb\n");
  await assert.rejects(ejectPrompt("lab", l, "root"), /이미/);
  const nested = await ejectPrompt("templates/concept-page", l, "project");
  assert.equal(nested, join(l.project, ".study", "prompts", "templates", "concept-page.md"));
  assert.equal(await readFile(nested, "utf8"), "t\n");
});

test("eject needs the chosen layer to be known", async () => {
  const l = await layout();
  await assert.rejects(ejectPrompt("lab", { defaults: l.defaults }, "project"), /프로젝트/);
});

test("diff shows changed lines against the current default", async () => {
  const l = await layout();
  assert.equal(await diffPrompt("lab", l), "(기본값과 같음)");
  const path = await ejectPrompt("lab", l, "root");
  await writeFile(path, "a\nc\nd\n");
  assert.equal(await diffPrompt("lab", l), "- b\n+ c\n+ d");
});

test("reset deletes only the chosen layer's override", async () => {
  const l = await layout();
  const rootFile = await ejectPrompt("lab", l, "root");
  const projectFile = await ejectPrompt("lab", l, "project");
  await resetPrompt("lab", l, "project");
  await assert.rejects(access(projectFile));
  await access(rootFile);
  await assert.rejects(resetPrompt("lab", l, "project"), /덮어쓴 파일이 없습니다/);
});

test("overridePath rejects names outside the known list", () => {
  assert.throws(() => overridePath("../../etc/passwd" as never, "/r"), /알 수 없는 지침/);
});
