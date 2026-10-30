import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { loadHistory, loadItem } from "../../src/knowledge/knowledge-store.ts";
import { executePlan, listPendingPlans, preparePlan } from "../../src/workspace/change-plan.ts";
import { recoverAll } from "../../src/workspace/recovery.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";
import { tempDir } from "../support/workspace-fixture.ts";

test("two PCs editing the same knowledge: the second write is refused, not merged silently", async (t) => {
  const { root, a } = await knowledgeWorkspace(t);
  const pc1 = applyKnowledgeChange(root, { changeId: "pc1", operation: "revise", id: a.id, expectedRevisionId: a.revisionId, reason: "PC1", patch: { scope: "PC1" } });
  await pc1;
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "pc2", operation: "revise", id: a.id, expectedRevisionId: a.revisionId, reason: "PC2", patch: { scope: "PC2" } }),
    /다른 변경/,
  );
  assert.equal((await loadItem(root, a.id))!.scope, "PC1");
  assert.equal((await loadHistory(root, a.id)).length, 2);
});

test("an interrupted knowledge change is never half-visible after recovery", async (t) => {
  const { root, a } = await knowledgeWorkspace(t);
  const itemFile = join(root, "knowledge", "items", `${a.id}.md`);
  const before = await readFile(itemFile, "utf8");
  // Simulate a crash in the middle of a multi-file plan.
  const plan = await preparePlan(root, "crash", [
    { path: `knowledge/items/${a.id}.md`, after: before.replace("TTL 설명", "중간 상태") },
    { path: `knowledge/history/${a.id}.jsonl`, after: "partial\n" },
  ]);
  await assert.rejects(executePlan(root, plan, { failAfterWrites: 1 }), /failpoint/);
  assert.equal((await listPendingPlans(root)).length, 1);
  await assert.rejects(
    applyKnowledgeChange(root, { changeId: "next", operation: "revise", id: a.id, expectedRevisionId: a.revisionId, reason: "r", patch: { scope: "x" } }),
    /미완료 변경 계획|다른 변경/,
  );
  await recoverAll(root, "rollback");
  assert.equal(await readFile(itemFile, "utf8"), before);
  assert.deepEqual(await listPendingPlans(root), []);
});

test("symlinked common directories are refused for every writer", async (t) => {
  const { root, refA } = await knowledgeWorkspace(t);
  const outside = await tempDir(t, "study-evil-");
  await symlink(outside, join(root, "review"));
  const { registerSchedules } = await import("../../src/review/review-store.ts");
  await assert.rejects(
    registerSchedules(root, { knowledgeIds: [refA.id], completedOn: "2026-10-01", origin: { projectId: "p-alpha", chapterSlug: "ch-01-intro" } }),
    /심볼릭 링크/,
  );
});

test("a user edit to a managed textbook region survives a knowledge revision", async (t) => {
  const { root, a, refA } = await knowledgeWorkspace(t);
  const { updateBinding } = await import("../../src/knowledge/chapter-bindings.ts");
  const { refreshTextbook } = await import("../../src/knowledge/textbook-refresh.ts");
  const readme = join(root, "study-alpha", "ch-01-intro", "README.md");
  await writeFile(readme, "# Ch\n\n## 개념 학습 노트\n");
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [refA] }] });
  await refreshTextbook(root, "study-alpha", "ch-01-intro", { apply: true, insertMissingAfterHeading: "## 개념 학습 노트" });
  await writeFile(readme, (await readFile(readme, "utf8")).replace("TTL 설명", "TTL 설명 — 내 표현"));
  await applyKnowledgeChange(root, { changeId: "rv", operation: "revise", id: a.id, expectedRevisionId: a.revisionId, reason: "r", patch: { explanation: "공식 새 설명" } });
  const result = await refreshTextbook(root, "study-alpha", "ch-01-intro", { apply: true });
  assert.equal(result.deferred.length, 1);
  assert.match(await readFile(readme, "utf8"), /내 표현/);
  assert.doesNotMatch(await readFile(readme, "utf8"), /공식 새 설명/);
});
