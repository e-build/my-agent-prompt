import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyBookChange } from "../../src/book/book-changes.ts";
import { DASHBOARD_PATH, refreshDashboard, renderDashboard } from "../../src/book/book-dashboard.ts";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { source } from "../support/knowledge-fixture.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

async function seed(t: any) {
  const root = await workspaceFixture(t);
  const k = (await applyKnowledgeChange(root, { changeId: "k1", operation: "create", reason: "교재", item: { name: "인터럽트 플래그", statement: "SECRET-STATEMENT", conditions: [], scope: "", status: "confirmed", explanation: "", aliases: [], sources: [source()] } })).items[0];
  await applyKnowledgeChange(root, { changeId: "k2", operation: "create", reason: "교재", item: { name: "미배치", statement: "s", conditions: [], scope: "", status: "uncertain", explanation: "", aliases: [], sources: [source()] } });
  const area = (await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "자바", parentId: null }] })).nodes[0];
  await applyBookChange(root, "agent", { changeId: "a1", reason: "ch-01 정리", operations: [
    { op: "create", key: "t", name: "스레드", parentId: area.id },
    { op: "place", id: "key:t", knowledgeIds: [k.id] },
    { op: "write_page", id: "key:t", body: "본문" },
    { op: "record_learned", id: "key:t", learnedIn: { projectId: "p-alpha", chapterSlug: "ch-01-intro", completedOn: "2026-11-03" } },
    { op: "propose", id: area.id, message: "이름 제안" },
  ] });
  await writeFile(join(root, "study-alpha", ".study", "state.json"), JSON.stringify({ version: 1, chapters: {
    "ch-01-intro": { test: { status: "completed" } },
    "ch-02-next": { test: { status: "not_started" } },
    "ch-03-done": { test: { status: "completed" } },
  } }));
  return root;
}

test("dashboard shows status, the tree with links, progress, waiting work and recent changes, but no proposition bodies", async (t) => {
  const root = await seed(t);
  const body = await renderDashboard(root, { today: "2026-11-04" });
  assert.match(body, /^# 내 교과서/);
  assert.match(body, /\| 자바 \| 2 \| 1 \| 1 \|/);
  assert.match(body, /- \[자바\]\(%EC%9E%90%EB%B0%94\/README\.md\)\n  - \[스레드\]\(%EC%9E%90%EB%B0%94\/%EC%8A%A4%EB%A0%88%EB%93%9C\/README\.md\) · 지식 1 · 챕터 1/);
  assert.match(body, /\| study-alpha \| 2 \/ 3 \|/);
  assert.match(body, /미배치 지식: 1개/);
  assert.match(body, /교과서 정리 대기: 1개 — study-alpha · ch-03-done/);
  assert.match(body, /검토할 제안: 1개/);
  assert.match(body, /- 2026-\d\d-\d\d · a1 · ch-01 정리/);
  assert.doesNotMatch(body, /SECRET-STATEMENT/);
});

test("refresh writes book/README.md as a managed region and keeps the learner's notes", async (t) => {
  const root = await seed(t);
  await refreshDashboard(root);
  const path = join(root, ...DASHBOARD_PATH.split("/"));
  const first = await readFile(path, "utf8");
  assert.match(first, /^<!-- study:book region=dashboard hash=[0-9a-f]{12} -->\n# 내 교과서/);
  await writeFile(path, first.replace("## 메모\n", "## 메모\n\n대시보드 메모\n"));
  await refreshDashboard(root);
  assert.match(await readFile(path, "utf8"), /대시보드 메모/);
});

test("book changes refresh the dashboard; a dashboard failure is a warning, not a failed change", async (t) => {
  const root = await workspaceFixture(t);
  const result = await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "자바", parentId: null }] });
  assert.equal(result.dashboardWarning, undefined);
  assert.match(await readFile(join(root, "book", "README.md"), "utf8"), /\| 자바 \| 1 \| 0 \| 0 \|/);
  await writeFile(join(root, "book", "README.md"), "<!-- study:book region=dashboard hash=000000000000 -->\nbroken");
  const second = await applyBookChange(root, "user", { changeId: "u2", reason: "영역", operations: [{ op: "create", name: "DB", parentId: null }] });
  assert.equal(second.status, "committed");
  assert.match(second.dashboardWarning!, /대시보드/);
});
