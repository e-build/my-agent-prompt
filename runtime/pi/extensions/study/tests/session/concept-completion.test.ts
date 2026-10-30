import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { updateBinding } from "../../src/knowledge/chapter-bindings.ts";
import { refreshTextbook } from "../../src/knowledge/textbook-refresh.ts";
import { finishConcept } from "../../src/session/concept-completion.ts";
import { loadStudyState } from "../../src/session/study-state.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";

async function setup(t: any) {
  const ctx = await knowledgeWorkspace(t);
  const readme = join(ctx.root, "study-alpha", "ch-01-intro", "README.md");
  await writeFile(readme, "# Ch 01\n\n## 개념 학습 노트\n\n내 메모\n");
  return { ...ctx, readme };
}

test("concept cannot finish without a binding and a rendered textbook region", async (t) => {
  const { root, refA } = await setup(t);
  await assert.rejects(finishConcept(root, "study-alpha", "ch-01-intro", { summary: "s" }), /지식 연결/);
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r-ttl", refs: [refA] }] });
  await assert.rejects(finishConcept(root, "study-alpha", "ch-01-intro", { summary: "s" }), /교재/);
  await assert.rejects(finishConcept(root, "study-alpha", "ch-01-intro", { summary: "" }), /summary/);
});

test("finishing concept saves state, records uncertainty and suggests the lab", async (t) => {
  const { root, refA } = await setup(t);
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r-ttl", refs: [refA] }] });
  await refreshTextbook(root, "study-alpha", "ch-01-intro", { apply: true, insertMissingAfterHeading: "## 개념 학습 노트" });
  const result = await finishConcept(root, "study-alpha", "ch-01-intro", { summary: "TTL 설명 완료", uncertain: ["이벤트 지연"] });
  assert.match(result.message, /lab/);
  const state = await loadStudyState(join(root, "study-alpha"));
  assert.equal(state.chapters["ch-01-intro"].concept.status, "completed");
  assert.match(state.chapters["ch-01-intro"].concept.reason!, /이벤트 지연/);
});

test("deferred textbook edits block completion until resolved", async (t) => {
  const { root, refA, readme, a } = await setup(t);
  await updateBinding(root, "study-alpha", "ch-01-intro", { expectedRevision: null, regions: [{ regionId: "r-ttl", refs: [refA] }] });
  await refreshTextbook(root, "study-alpha", "ch-01-intro", { apply: true, insertMissingAfterHeading: "## 개념 학습 노트" });
  const { readFile } = await import("node:fs/promises");
  await writeFile(readme, (await readFile(readme, "utf8")).replace("TTL 설명", "TTL 설명(수정)"));
  const { applyKnowledgeChange } = await import("../../src/knowledge/knowledge-changes.ts");
  await applyKnowledgeChange(root, { changeId: "rv", operation: "revise", id: a.id, expectedRevisionId: a.revisionId, reason: "r", patch: { explanation: "새 설명" } });
  await assert.rejects(finishConcept(root, "study-alpha", "ch-01-intro", { summary: "s" }), /보류/);
});
