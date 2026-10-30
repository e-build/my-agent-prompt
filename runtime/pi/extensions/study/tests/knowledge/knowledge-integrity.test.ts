import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { checkKnowledgeIntegrity } from "../../src/knowledge/knowledge-integrity.ts";
import { registerSchedules } from "../../src/review/review-store.ts";
import { checkWorkspace } from "../../src/workspace/workspace-actions.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";
import { treeDigest } from "../support/workspace-fixture.ts";

test("a healthy workspace has no integrity issues and the check writes nothing", async (t) => {
  const { root, a, refA } = await knowledgeWorkspace(t);
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [refA] }] });
  await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin: { projectId: "p-alpha", chapterSlug: "ch-01-intro" } });
  const before = await treeDigest(root);
  assert.deepEqual(await checkKnowledgeIntegrity(root), []);
  assert.equal(await treeDigest(root), before);
});

test("detects merge conflicts, corrupt files, broken links and diverged versions after syncing PCs", async (t) => {
  const { root, a, b } = await knowledgeWorkspace(t);
  const itemFile = join(root, "knowledge", "items", `${a.id}.md`);
  await writeFile(itemFile, `<<<<<<< HEAD\n${await readFile(itemFile, "utf8")}=======\nother\n>>>>>>> pc2\n`);
  const bItem = join(root, "knowledge", "items", `${b.id}.md`);
  const content = await readFile(bItem, "utf8");
  await writeFile(bItem, content.replace(`"version": 1`, `"version": 7`));
  await mkdir(join(root, "review", "items"), { recursive: true });
  await writeFile(join(root, "review", "items", "k-missing0.json"), JSON.stringify({ knowledgeId: "k-missing0", status: "active" }));
  await writeFile(
    join(root, "knowledge", "chains.jsonl"),
    `${JSON.stringify({ id: "c-1", premiseRefs: [{ id: "k-gone0000", version: 1, revisionId: "r" }], conclusionRef: { id: b.id, version: 1, revisionId: b.revisionId }, sourceRefs: [{ materialId: "m", kind: "url", locator: "u", observedAt: "t", basis: "explicit" }], revisionId: "r" })}\n`,
  );
  const issues = (await checkKnowledgeIntegrity(root)).join("\n");
  assert.match(issues, /충돌 표시/);
  assert.match(issues, new RegExp(`${b.id}.*이력`));
  assert.match(issues, /k-missing0/);
  assert.match(issues, /k-gone0000/);
  const workspaceIssues = (await checkWorkspace(root, [checkKnowledgeIntegrity])).issues.join("\n");
  assert.match(workspaceIssues, /충돌 표시/);
});
