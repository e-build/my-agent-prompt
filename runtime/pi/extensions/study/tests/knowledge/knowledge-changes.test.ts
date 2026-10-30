import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import {
  itemAtRevision,
  loadChains,
  loadHistory,
  loadItem,
  resolveCanonical,
} from "../../src/knowledge/knowledge-store.ts";
import { source } from "../support/knowledge-fixture.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

const now = () => "2026-10-30T01:00:00.000Z";
const draft = (name: string, statement = `${name} 설명`) => ({
  name,
  statement,
  conditions: ["기본 설정"],
  scope: "Redis",
  status: "confirmed" as const,
  explanation: `${name} 본문`,
  aliases: [],
  sources: [source()],
});

async function create(root: string, changeId: string, name: string) {
  const result = await applyKnowledgeChange(root, { changeId, operation: "create", reason: "교재", item: draft(name) }, { now });
  return result.items[0];
}

test("create stores a versioned file and full history snapshot", async (t) => {
  const root = await workspaceFixture(t);
  const item = await create(root, "chg-1", "TTL");
  assert.match(item.id, /^k-/);
  assert.equal(item.version, 1);
  assert.deepEqual(await loadItem(root, item.id), item);
  const history = await loadHistory(root, item.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].changeId, "chg-1");
  assert.deepEqual(history[0].snapshot, item);
  const retry = await applyKnowledgeChange(root, { changeId: "chg-1", operation: "create", reason: "교재", item: draft("TTL") }, { now });
  assert.equal(retry.status, "already_applied");
  assert.equal((await loadHistory(root, item.id)).length, 1);
});

test("revise requires the expected revision and keeps the old version queryable", async (t) => {
  const root = await workspaceFixture(t);
  const v1 = await create(root, "chg-1", "TTL");
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "chg-2", operation: "revise", id: v1.id, expectedRevisionId: "stale", reason: "정밀화", patch: { statement: "새 문장" } }, { now }),
    /다른 변경/,
  );
  const { items: [v2] } = await applyKnowledgeChange(
    root,
    { changeId: "chg-2", operation: "revise", id: v1.id, expectedRevisionId: v1.revisionId, reason: "정밀화", patch: { statement: "새 문장" } },
    { now },
  );
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.parentRevisionIds, [v1.revisionId]);
  assert.equal((await itemAtRevision(root, v1.id, v1.revisionId))?.statement, v1.statement);
  assert.equal((await loadItem(root, v1.id))?.statement, "새 문장");
});

test("expressions and status changes follow the evidence rules", async (t) => {
  const root = await workspaceFixture(t);
  const uncertain = (
    await applyKnowledgeChange(root, { changeId: "c1", operation: "create", reason: "후보", item: { ...draft("후보"), status: "uncertain", sources: [] } }, { now })
  ).items[0];
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "c2", operation: "set_status", id: uncertain.id, expectedRevisionId: uncertain.revisionId, status: "confirmed", reason: "확인" }, { now }),
    /출처/,
  );
  const expressed = (
    await applyKnowledgeChange(root, { changeId: "c3", operation: "add_expression", id: uncertain.id, expectedRevisionId: uncertain.revisionId, reason: "자료 확인", aliases: ["다른 표현"], sources: [source()] }, { now })
  ).items[0];
  assert.deepEqual(expressed.aliases, ["다른 표현"]);
  const confirmed = (
    await applyKnowledgeChange(root, { changeId: "c4", operation: "set_status", id: uncertain.id, expectedRevisionId: expressed.revisionId, status: "confirmed", reason: "공식 문서" }, { now })
  ).items[0];
  assert.equal(confirmed.status, "confirmed");
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "c5", operation: "set_status", id: uncertain.id, expectedRevisionId: confirmed.revisionId, status: "conflicted", reason: "" }, { now }),
    /reason/,
  );
});

test("merge redirects without deleting, and unmerge restores the original links", async (t) => {
  const root = await workspaceFixture(t);
  const a = await create(root, "c1", "A");
  const b = await create(root, "c2", "B");
  const merged = await applyKnowledgeChange(
    root,
    { changeId: "c3", operation: "merge", sourceId: b.id, targetId: a.id, expectedRevisionIds: { [a.id]: a.revisionId, [b.id]: b.revisionId }, reason: "같은 뜻·조건" },
    { now },
  );
  assert.equal(merged.items.length, 2);
  assert.equal((await loadItem(root, b.id))?.mergedInto, a.id);
  assert.equal(await resolveCanonical(root, b.id), a.id);
  const target = (await loadItem(root, a.id))!;
  assert.ok(target.aliases.includes(b.statement));

  const afterMergeB = (await loadItem(root, b.id))!;
  await applyKnowledgeChange(
    root,
    { changeId: "c4", operation: "unmerge", sourceId: b.id, expectedRevisionIds: { [a.id]: target.revisionId, [b.id]: afterMergeB.revisionId }, reason: "조건이 달랐음" },
    { now },
  );
  assert.equal((await loadItem(root, b.id))?.mergedInto, undefined);
  assert.equal(await resolveCanonical(root, b.id), b.id);
  assert.deepEqual((await loadItem(root, a.id))?.aliases, a.aliases);
  assert.equal((await loadItem(root, b.id))?.statement, b.statement);
});

test("merge refuses cycles and already-merged targets", async (t) => {
  const root = await workspaceFixture(t);
  const a = await create(root, "c1", "A");
  const b = await create(root, "c2", "B");
  await applyKnowledgeChange(root, { changeId: "c3", operation: "merge", sourceId: b.id, targetId: a.id, expectedRevisionIds: { [a.id]: a.revisionId, [b.id]: b.revisionId }, reason: "같음" }, { now });
  const a2 = (await loadItem(root, a.id))!;
  const b2 = (await loadItem(root, b.id))!;
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "c4", operation: "merge", sourceId: a.id, targetId: b.id, expectedRevisionIds: { [a.id]: a2.revisionId, [b.id]: b2.revisionId }, reason: "x" }, { now }),
    /병합/,
  );
});

test("undo reverts only when nothing changed afterwards", async (t) => {
  const root = await workspaceFixture(t);
  const v1 = await create(root, "c1", "A");
  const { items: [v2] } = await applyKnowledgeChange(root, { changeId: "c2", operation: "revise", id: v1.id, expectedRevisionId: v1.revisionId, reason: "r", patch: { scope: "변경" } }, { now });
  const undone = await applyKnowledgeChange(root, { changeId: "c3", operation: "undo", targetChangeId: "c2", reason: "잘못 수정" }, { now });
  const v3 = undone.items[0];
  assert.equal(v3.version, 3);
  assert.equal(v3.scope, v1.scope);
  assert.deepEqual(v3.parentRevisionIds, [v2.revisionId]);
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "c4", operation: "undo", targetChangeId: "c2", reason: "again" }, { now }),
    /이후 변경/,
  );
  const created = await applyKnowledgeChange(root, { changeId: "c5", operation: "undo", targetChangeId: "c1", reason: "x" }, { now }).catch((e) => e);
  assert.match(String(created), /이후 변경/);
});

test("chains keep joint premises and refuse missing items", async (t) => {
  const root = await workspaceFixture(t);
  const a = await create(root, "c1", "A");
  const b = await create(root, "c2", "B");
  const c = await create(root, "c3", "C");
  const ref = (x: typeof a) => ({ id: x.id, version: x.version, revisionId: x.revisionId });
  await applyKnowledgeChange(root, { changeId: "c4", operation: "add_chain", reason: "공식 문서", chain: { premiseRefs: [ref(a), ref(b)], conclusionRef: ref(c), sourceRefs: [source()] } }, { now });
  await applyKnowledgeChange(root, { changeId: "c5", operation: "add_chain", reason: "단독 근거", chain: { premiseRefs: [ref(a)], conclusionRef: ref(c), sourceRefs: [source()] } }, { now });
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "c6", operation: "add_chain", reason: "중복", chain: { premiseRefs: [ref(b), ref(a)], conclusionRef: ref(c), sourceRefs: [source()] } }, { now }),
    /같은 전제 묶음/,
  );
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "c7", operation: "add_chain", reason: "x", chain: { premiseRefs: [{ ...ref(a), id: "k-missing0" }], conclusionRef: ref(c), sourceRefs: [source()] } }, { now }),
    /찾지 못했습니다/,
  );
  const chains = await loadChains(root);
  assert.equal(chains.length, 2);
  assert.equal(chains[0].premiseRefs.length, 2);
  await applyKnowledgeChange(root, { changeId: "c8", operation: "retire_chain", chainId: chains[1].id, reason: "근거 철회" }, { now });
  assert.equal((await loadChains(root)).filter((x) => !x.retired).length, 1);
});

test("a corrupt item file is reported instead of being overwritten", async (t) => {
  const root = await workspaceFixture(t);
  const a = await create(root, "c1", "A");
  const path = join(root, "knowledge", "items", `${a.id}.md`);
  await writeFile(path, "broken");
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "c2", operation: "revise", id: a.id, expectedRevisionId: a.revisionId, reason: "r", patch: { scope: "x" } }, { now }),
    /메타데이터/,
  );
  assert.equal(await readFile(path, "utf8"), "broken");
});
