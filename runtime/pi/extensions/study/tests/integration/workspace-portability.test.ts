import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { listEvidence, recordAnswer } from "../../src/evidence/evidence-store.ts";
import { prepareQuestion } from "../../src/evidence/question-store.ts";
import { loadBinding, updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { buildKnowledgeView } from "../../src/knowledge/knowledge-view.ts";
import { registerSchedules, loadSchedule } from "../../src/review/review-store.ts";
import { findWorkspaceRoot, projectForPath } from "../../src/workspace/workspace-root.ts";
import { knowledgeWorkspace, scoredQuestion } from "../support/evidence-fixture.ts";
import { tempDir } from "../support/workspace-fixture.ts";

test("a copied root at another absolute path keeps every link working", async (t) => {
  const { root, a, refA } = await knowledgeWorkspace(t);
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r1", refs: [refA] }] });
  await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin: { projectId: "p-alpha", chapterSlug: "ch-01-intro" } });
  const q = await prepareQuestion(root, scoredQuestion([refA]) as any);
  await recordAnswer(root, { submissionId: "s1", questionId: q.id, response: "답", responseAnchor: "x", assistance: "independent", submittedAt: "2026-10-01T00:00:00Z", findings: [{ ref: refA, result: "demonstrated", reason: "" }] });

  const other = join(await tempDir(t, "study-other-pc-"), "nested", "study");
  await cp(root, other, { recursive: true });
  // PC-local data is not portable and is regenerated as needed.
  await rm(join(other, ".study", "local"), { recursive: true, force: true });

  const moved = (await findWorkspaceRoot(join(other, "study-alpha", "ch-01-intro")))!;
  assert.equal(moved.root, other);
  assert.equal(projectForPath(moved, join(other, "study-alpha"))?.id, "p-alpha");
  assert.equal((await loadBinding(other, "study-alpha", "ch-01-intro"))?.regions[0].refs[0].id, a.id);
  assert.equal((await loadSchedule(other, a.id))?.dueDate, "2026-10-02");
  assert.equal((await listEvidence(other)).length, 1);
  assert.ok((await buildKnowledgeView(other, { today: "2026-10-05" })).nodes.length >= 3);
});
