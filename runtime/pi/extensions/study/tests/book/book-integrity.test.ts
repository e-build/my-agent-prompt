import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { join } from "node:path";
import { applyBookChange } from "../../src/book/book-changes.ts";
import { checkBookIntegrity } from "../../src/book/book-integrity.ts";
import { planChapter } from "../../src/book/book-query.ts";
import { runConceptsCommand, type ConceptsUi } from "../../src/book/concepts-command.ts";
import { loadConcepts } from "../../src/book/book-store.ts";
import { updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { source } from "../support/knowledge-fixture.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

async function knowledge(root: string, changeId: string, name: string) {
  const { items } = await applyKnowledgeChange(root, { changeId, operation: "create", reason: "교재", item: { name, statement: `${name} s`, conditions: [], scope: "", status: "confirmed", explanation: "", aliases: [], sources: [source()] } });
  return items[0];
}

test("integrity reports missing pages, corrupt pages and conflict markers without repairing", async (t) => {
  const root = await workspaceFixture(t);
  assert.deepEqual(await checkBookIntegrity(root), []);
  await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "동시성", parentId: null }] });
  assert.deepEqual(await checkBookIntegrity(root), []);
  const page = join(root, "book", "동시성", "README.md");
  await writeFile(page, "# 손으로 덮어씀\n");
  assert.match((await checkBookIntegrity(root)).join("\n"), /교과서 페이지 손상: book\/동시성\/README\.md/);
  await rm(page);
  assert.match((await checkBookIntegrity(root)).join("\n"), /교과서 페이지가 없습니다/);
  const [node] = await loadConcepts(root);
  const file = join(root, "knowledge", "concepts", `${node.id}.json`);
  await writeFile(file, `<<<<<<< HEAD\n${await readFile(file, "utf8")}`);
  assert.match((await checkBookIntegrity(root)).join("\n"), /Git 충돌 표시/);
});

test("plan maps a chapter's propositions to existing pages and lists unplaced ones", async (t) => {
  const root = await workspaceFixture(t);
  const a = await knowledge(root, "k1", "인터럽트 플래그");
  const b = await knowledge(root, "k2", "InterruptedException");
  const area = (await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "동시성", parentId: null }] })).nodes[0];
  await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [{ op: "create", key: "i", name: "인터럽트", parentId: area.id }, { op: "place", id: "key:i", knowledgeIds: [a.id] }] });
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [a, b].map((k) => ({ id: k.id, version: k.version, revisionId: k.revisionId })) }] });
  const plan = await planChapter(root, "study-alpha", "ch-01-intro");
  assert.deepEqual(plan.pages.map((p) => [p.path, p.knowledge.map((k) => k.name)]), [["book/동시성/인터럽트/README.md", ["인터럽트 플래그"]]]);
  assert.deepEqual(plan.unplaced.map((k) => k.name), ["InterruptedException"]);
  assert.match(plan.tree, /- 동시성 \[사용자\][\s\S]*  - 인터럽트 · 지식 1/);
  assert.equal(plan.projectId, "p-alpha");
  assert.deepEqual(plan.materials, { readme: "study-alpha/ch-01-intro/README.md", lab: [], questions: [], tests: [] });
});

test("plan lists materials by path only: chapter questions, lab notes and passed tests", async (t) => {
  const root = await workspaceFixture(t);
  const project = join(root, "study-alpha");
  await mkdir(join(project, "ch-01-intro", "lab"), { recursive: true });
  await writeFile(join(project, "ch-01-intro", "lab", "results.md"), "# 실습 결과\n");
  await mkdir(join(project, ".study", "dialogue", "questions"), { recursive: true });
  const question = (id: string, chapterSlug: string, purpose = "diagnosis") =>
    writeFile(join(project, ".study", "dialogue", "questions", `${id}.json`), JSON.stringify({ id, purpose, context: { chapterSlug }, criteria: { answer: "SECRET" } }));
  await question("q-aaaaaaaaaaaaaaaaaaaa", "ch-01-intro");
  await question("q-bbbbbbbbbbbbbbbbbbbb", "ch-02-other");
  await question("q-cccccccccccccccccccc", "ch-01-intro", "prediction");
  await mkdir(join(project, ".study", "assessments"), { recursive: true });
  const assessment = (id: string, value: object) => writeFile(join(project, ".study", "assessments", `${id}.json`), JSON.stringify(value));
  await assessment("t-pass", { kind: "test", questionSet: { chapterSlug: "ch-01-intro" }, grade: { passed: true } });
  await assessment("t-fail", { kind: "test", questionSet: { chapterSlug: "ch-01-intro" }, grade: { passed: false } });
  await assessment("d-1", { kind: "diagnosis", questionSet: { chapterSlug: "ch-01-intro" } });
  const plan = await planChapter(root, "study-alpha", "ch-01-intro");
  assert.deepEqual(plan.materials, {
    readme: "study-alpha/ch-01-intro/README.md",
    lab: ["study-alpha/ch-01-intro/lab/results.md"],
    questions: [
      { id: "q-aaaaaaaaaaaaaaaaaaaa", purpose: "diagnosis", path: "study-alpha/.study/dialogue/questions/q-aaaaaaaaaaaaaaaaaaaa.json" },
      { id: "q-cccccccccccccccccccc", purpose: "prediction", path: "study-alpha/.study/dialogue/questions/q-cccccccccccccccccccc.json" },
    ],
    tests: ["study-alpha/.study/assessments/t-pass.json"],
  });
  assert.equal(JSON.stringify(plan).includes("SECRET"), false);
});

test("/study-concepts edits run as the user and take ownership", async (t) => {
  const root = await workspaceFixture(t);
  const notes: string[] = [];
  const ui = (answers: string[]): ConceptsUi => ({
    select: async (_title, options) => {
      const answer = answers.shift()!;
      return options.find((o) => o.trim().startsWith(answer));
    },
    input: async () => answers.shift(),
    notify: (message) => notes.push(message),
  });
  await runConceptsCommand(root, ui(["최상위 영역 만들기", "동시성"]));
  const area = (await loadConcepts(root))[0];
  await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [{ op: "create", name: "스레드", parentId: area.id }] });
  await runConceptsCommand(root, ui(["개념 이름 바꾸기", "스레드", "자바 스레드"]));
  const renamed = (await loadConcepts(root)).find((n) => n.name === "자바 스레드")!;
  assert.equal(renamed.owner, "user");
  await assert.rejects(
    applyBookChange(root, "agent", { changeId: "a2", reason: "x", operations: [{ op: "rename", id: renamed.id, name: "스레드", expectedRevisionId: renamed.revisionId }] }),
    /propose/,
  );
  await runConceptsCommand(root, ui(["개념 위계 보기"]));
  assert.match(notes.at(-1)!, /자바 스레드 \[사용자\]/);
});
