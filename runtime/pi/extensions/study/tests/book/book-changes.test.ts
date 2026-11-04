import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { applyBookChange } from "../../src/book/book-changes.ts";
import { loadConcepts } from "../../src/book/book-store.ts";
import { parsePage } from "../../src/book/book-page.ts";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { source } from "../support/knowledge-fixture.ts";
import { treeDigest, workspaceFixture } from "../support/workspace-fixture.ts";

const now = () => "2026-11-03T01:00:00.000Z";

async function setup(t: any) {
  const root = await workspaceFixture(t);
  const area = await applyBookChange(root, "user", { changeId: "u1", reason: "영역", operations: [{ op: "create", name: "동시성", parentId: null }] }, { now });
  const knowledge = await applyKnowledgeChange(root, {
    changeId: "k1",
    operation: "create",
    reason: "교재",
    item: { name: "인터럽트 플래그", statement: "s", conditions: [], scope: "", status: "confirmed", explanation: "", aliases: [], sources: [source()] },
  });
  return { root, area: area.nodes[0], k: knowledge.items[0] };
}

const read = (root: string, path: string) => readFile(join(root, ...path.split("/")), "utf8");

test("agent creates a sub-concept with a page in one atomic batch", async (t) => {
  const { root, area, k } = await setup(t);
  const result = await applyBookChange(root, "agent", {
    changeId: "a1",
    reason: "ch-01 완료",
    operations: [
      { op: "create", key: "intr", name: "인터럽트", parentId: area.id },
      { op: "place", id: "key:intr", knowledgeIds: [k.id] },
      { op: "write_page", id: "key:intr", body: "인터럽트는 협력적 취소 요청이다." },
      { op: "record_learned", id: "key:intr", learnedIn: { projectId: "p-alpha", chapterSlug: "ch-01-intro", completedOn: "2026-11-03" } },
    ],
  }, { now });
  assert.equal(result.status, "committed");
  const path = "book/동시성/인터럽트/README.md";
  assert.deepEqual(result.pages.map((p) => [p.action, p.path]), [["updated", "book/동시성/README.md"], ["created", path]]);
  const page = parsePage(await read(root, path));
  assert.equal(page.regions.main.body, "인터럽트는 협력적 취소 요청이다.");
  assert.match(page.regions.head.body, /\[동시성\]\(\.\.\/README\.md\) › \*\*인터럽트\*\*/);
  assert.match(page.regions.foot.body, /\[study-alpha · ch-01-intro\]\(\.\.\/\.\.\/\.\.\/study-alpha\/ch-01-intro\/README\.md\) · 2026-11-03/);
  assert.match(parsePage(await read(root, "book/동시성/README.md")).regions.head.body, /- \[인터럽트\]\(%EC%9D%B8/);
  const node = (await loadConcepts(root)).find((n) => n.name === "인터럽트")!;
  assert.equal(node.owner, "agent");
  assert.deepEqual(node.members, [k.id]);
  const retry = await applyBookChange(root, "agent", { changeId: "a1", reason: "ch-01 완료", operations: [
    { op: "create", key: "intr", name: "인터럽트", parentId: area.id },
    { op: "place", id: "key:intr", knowledgeIds: [k.id] },
    { op: "write_page", id: "key:intr", body: "인터럽트는 협력적 취소 요청이다." },
    { op: "record_learned", id: "key:intr", learnedIn: { projectId: "p-alpha", chapterSlug: "ch-01-intro", completedOn: "2026-11-03" } },
  ] }, { now });
  assert.equal(retry.status, "already_applied");
  assert.equal((await loadConcepts(root)).length, 2);
});

test("agent cannot create areas or restructure user-owned nodes, and a failed batch writes nothing", async (t) => {
  const { root, area, k } = await setup(t);
  const before = await treeDigest(root);
  await assert.rejects(applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [{ op: "create", name: "DB", parentId: null }] }), /최상위 영역은 사용자만/);
  await assert.rejects(applyBookChange(root, "agent", { changeId: "a2", reason: "x", operations: [{ op: "rename", id: area.id, name: "병행성", expectedRevisionId: area.revisionId }] }), /propose/);
  await assert.rejects(applyBookChange(root, "agent", { changeId: "a3", reason: "x", operations: [
    { op: "create", key: "a", name: "A", parentId: area.id },
    { op: "place", id: "key:a", knowledgeIds: [k.id] },
    { op: "create", key: "b", name: "B", parentId: area.id },
    { op: "place", id: "key:b", knowledgeIds: [k.id] },
  ] }), /두 페이지/);
  assert.equal(await treeDigest(root), before);
  const proposed = await applyBookChange(root, "agent", { changeId: "a4", reason: "이름", operations: [{ op: "propose", id: area.id, message: "병행성으로 바꾸면 어떨까요" }] }, { now });
  assert.equal(proposed.status, "committed");
  assert.match(await read(root, "knowledge/concepts/proposals.jsonl"), /병행성/);
});

test("stale expected revision is rejected", async (t) => {
  const { root, area } = await setup(t);
  await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [{ op: "write_page", id: area.id, body: "v1", expectedRevisionId: area.revisionId }] }, { now });
  await assert.rejects(
    applyBookChange(root, "agent", { changeId: "a2", reason: "x", operations: [{ op: "write_page", id: area.id, body: "v2", expectedRevisionId: area.revisionId }] }),
    /다른 변경이 먼저/,
  );
});

test("rename and move relocate page files with notes; edited body is never overwritten without adopt", async (t) => {
  const { root, area } = await setup(t);
  const created = await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [
    { op: "create", key: "t", name: "스레드", parentId: area.id },
    { op: "write_page", id: "key:t", body: "원래 본문" },
  ] }, { now });
  const node = created.nodes.find((n) => n.name === "스레드")!;
  const oldPath = join(root, "book", "동시성", "스레드", "README.md");
  await writeFile(oldPath, (await readFile(oldPath, "utf8")).replace("## 메모\n", "## 메모\n\n내 메모\n"));
  const renamed = await applyBookChange(root, "agent", { changeId: "a2", reason: "이름", operations: [{ op: "rename", id: node.id, name: "자바 스레드", expectedRevisionId: node.revisionId }] }, { now });
  assert.deepEqual(renamed.pages.find((p) => p.conceptId === node.id), { conceptId: node.id, path: "book/동시성/자바 스레드/README.md", action: "moved", from: "book/동시성/스레드/README.md" });
  assert.equal(existsSync(oldPath), false);
  assert.equal(existsSync(join(root, "book", "동시성", "스레드")), false);
  const newPath = join(root, "book", "동시성", "자바 스레드", "README.md");
  assert.match(await readFile(newPath, "utf8"), /내 메모/);

  await writeFile(newPath, (await readFile(newPath, "utf8")).replace("원래 본문", "내가 고친 본문"));
  const current = (await loadConcepts(root)).find((n) => n.id === node.id)!;
  await assert.rejects(
    applyBookChange(root, "agent", { changeId: "a3", reason: "보강", operations: [{ op: "write_page", id: node.id, body: "에이전트 본문", expectedRevisionId: current.revisionId }] }),
    /직접 고친 본문/,
  );
  await applyBookChange(root, "agent", { changeId: "a4", reason: "수정본 채택", operations: [{ op: "adopt_page", id: node.id, expectedRevisionId: current.revisionId }] }, { now });
  const adopted = parsePage(await readFile(newPath, "utf8"));
  assert.equal(adopted.regions.main.body, "내가 고친 본문");
  assert.equal(adopted.regions.main.edited, false);
});

test("retire carries notes into the target page; undo restores files and nodes", async (t) => {
  const { root, area, k } = await setup(t);
  const made = await applyBookChange(root, "agent", { changeId: "a1", reason: "x", operations: [
    { op: "create", key: "a", name: "A", parentId: area.id },
    { op: "create", key: "b", name: "B", parentId: area.id },
    { op: "place", id: "key:a", knowledgeIds: [k.id] },
  ] }, { now });
  const [a, b] = ["A", "B"].map((name) => made.nodes.find((n) => n.name === name)!);
  const aPath = join(root, "book", "동시성", "A", "README.md");
  await writeFile(aPath, (await readFile(aPath, "utf8")).replace("## 메모\n", "## 메모\n\nA 메모\n"));
  const before = await treeDigest(root);
  await applyBookChange(root, "agent", { changeId: "a2", reason: "합치기", operations: [
    { op: "move_member", from: a.id, to: b.id, knowledgeIds: [k.id], expectedRevisionIds: { [a.id]: a.revisionId, [b.id]: b.revisionId } },
    { op: "write_page", id: b.id, body: "A와 B를 합친 본문" },
    { op: "retire", id: a.id, into: b.id },
  ] }, { now });
  assert.equal(existsSync(aPath), false);
  assert.equal(existsSync(join(root, "book", "동시성", "A")), false);
  assert.match(await read(root, "book/동시성/B/README.md"), /### A에서 옮긴 메모\n\nA 메모/);
  assert.deepEqual((await loadConcepts(root)).find((n) => n.id === b.id)!.members, [k.id]);

  const undone = await applyBookChange(root, "user", { changeId: "u2", reason: "되돌리기", undo: "a2" }, { now });
  assert.equal(undone.status, "committed");
  assert.match(await readFile(aPath, "utf8"), /A 메모/);
  const nodes = await loadConcepts(root);
  assert.equal(nodes.find((n) => n.id === a.id)!.retired, undefined);
  assert.deepEqual(nodes.find((n) => n.id === a.id)!.members, [k.id]);
  assert.notEqual(await treeDigest(root), before); // history and change records grew
  await assert.rejects(applyBookChange(root, "user", { changeId: "u3", reason: "다시", undo: "a2" }), /이후 변경/);
});
