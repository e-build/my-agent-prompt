import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findStudyProjectRoot } from "./study-command.ts";

const findRoot = findStudyProjectRoot;

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = await mkdtemp(join(tmpdir(), "study-root-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  return base;
}
async function project(base: string, slug: string) {
  const root = join(base, slug);
  await mkdir(join(root, "ch-01-basics"), { recursive: true });
  return root;
}

test("curriculum resolves the same project from root, chapter, and app", async (t) => {
  const base = await fixture(t);
  const root = await project(base, "study-cache");
  await mkdir(join(root, "app"));
  for (const cwd of [root, join(root, "ch-01-basics"), join(root, "app")]) {
    assert.equal(await findRoot(cwd, { projectSlug: "study-cache", allowCreate: true }), root);
  }
});

test("curriculum selects the requested slug rather than the first child project", async (t) => {
  const base = await fixture(t);
  await project(base, "study-alpha");
  const root = await project(base, "study-cache");
  assert.equal(await findRoot(base, { projectSlug: "study-cache", allowCreate: true }), root);
});

test("generic lookup rejects multiple child projects", async (t) => {
  const base = await fixture(t);
  await project(base, "study-alpha");
  await project(base, "study-cache");
  await assert.rejects(findRoot(base), /여러 개/);
});

test("generic lookup reports ambiguity before validating unrelated legacy metadata", async (t) => {
  const base = await fixture(t);
  const other = await project(base, "study-alpha");
  await mkdir(join(other, ".study"));
  await writeFile(join(other, ".study", "project.json"), JSON.stringify({ projectSlug: "." }));
  await project(base, "study-cache");
  await assert.rejects(findRoot(base), /여러 개/);
});

test("a manifest identifies an initialized project before chapters exist", async (t) => {
  const base = await fixture(t);
  const root = join(base, "study-cache");
  await mkdir(join(root, ".study"), { recursive: true });
  await writeFile(
    join(root, ".study", "project.json"),
    JSON.stringify({ projectSlug: "study-cache" }),
  );
  assert.equal(await findRoot(root), root);
});

test("curriculum reuses a matching empty root during initialization", async (t) => {
  const base = await fixture(t);
  const root = join(base, "study-cache");
  await mkdir(root);
  assert.equal(await findRoot(root, { projectSlug: "study-cache", allowCreate: true }), root);
});

test("curriculum can resolve a new child root without creating directories", async (t) => {
  const base = await fixture(t);
  assert.equal(
    await findRoot(base, { projectSlug: "study-cache", allowCreate: true }),
    join(base, "study-cache"),
  );
});

test("curriculum does not silently nest another project inside an existing project", async (t) => {
  const base = await fixture(t);
  const root = await project(base, "study-alpha");
  await assert.rejects(
    findRoot(root, { projectSlug: "study-cache", allowCreate: true }),
    /projectRoot/,
  );
});

test("an explicit sibling root is allowed from another project", async (t) => {
  const base = await fixture(t);
  const other = await project(base, "study-alpha");
  const root = join(base, "study-cache");
  assert.equal(
    await findRoot(other, {
      projectSlug: "study-cache",
      projectRoot: "../study-cache",
      allowCreate: true,
    }),
    root,
  );
});

test("an explicit project root must match the requested slug", async (t) => {
  const base = await fixture(t);
  const root = await project(base, "study-alpha");
  await assert.rejects(
    findRoot(base, { projectSlug: "study-cache", projectRoot: root, allowCreate: true }),
    /일치/,
  );
});

test("a manifest slug mismatch is rejected", async (t) => {
  const base = await fixture(t);
  const root = await project(base, "study-cache");
  await mkdir(join(root, ".study"));
  await writeFile(
    join(root, ".study", "project.json"),
    JSON.stringify({ projectSlug: "study-other" }),
  );
  await assert.rejects(findRoot(root, { projectSlug: "study-cache", allowCreate: true }), /일치/);
});

test("curriculum rejects path-like project slugs", async (t) => {
  const base = await fixture(t);
  await project(base, "study-cache");
  for (const projectSlug of [
    "../study-cache",
    "/tmp/study-cache",
    "study-cache/child",
    "study-cache\\child",
    ".",
    "",
    "study-",
  ]) {
    await assert.rejects(findRoot(base, { projectSlug, allowCreate: true }), /slug/);
  }
});

test("lookup cannot create a new root unless creation is explicitly allowed", async (t) => {
  const base = await fixture(t);
  await assert.rejects(findRoot(base, { projectSlug: "study-cache" }), /찾지 못/);
});

test("an explicit root cannot nest inside another study project", async (t) => {
  const base = await fixture(t);
  const root = await project(base, "study-alpha");
  await assert.rejects(
    findRoot(base, {
      projectSlug: "study-cache",
      projectRoot: join(root, "study-cache"),
      allowCreate: true,
    }),
    /중첩/,
  );
});

test("generic lookup still selects a sole child project", async (t) => {
  const base = await fixture(t);
  const root = await project(base, "study-cache");
  assert.equal(await findRoot(base), root);
});

test("a file cannot serve as a project root", async (t) => {
  const base = await fixture(t);
  const root = join(base, "study-cache");
  await writeFile(root, "not a directory");
  await assert.rejects(
    findRoot(base, { projectSlug: "study-cache", projectRoot: root, allowCreate: true }),
  );
});

test("malformed project metadata is not silently overwritten", async (t) => {
  const base = await fixture(t);
  const root = await project(base, "study-cache");
  await mkdir(join(root, ".study"));
  await writeFile(join(root, ".study", "project.json"), "{bad json");
  await assert.rejects(
    findRoot(root, { projectSlug: "study-cache", allowCreate: true }),
    /project.json/,
  );
});
