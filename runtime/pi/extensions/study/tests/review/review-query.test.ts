import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildIntegratedReviewPage } from "../../src/review/integrated-review-page.ts";
import { dueReviews } from "../../src/review/review-query.ts";
import { loadSchedule, registerSchedules, saveSchedule } from "../../src/review/review-store.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";
import { treeDigest } from "../support/workspace-fixture.ts";

async function setup(t: any) {
  const ctx = await knowledgeWorkspace(t);
  await registerSchedules(ctx.root, { knowledgeIds: [ctx.a.id], completedOn: "2026-10-01", origin: { projectId: "p-alpha", chapterSlug: "ch-01-intro" } });
  await registerSchedules(ctx.root, { knowledgeIds: [ctx.b.id], completedOn: "2026-10-04", origin: { projectId: "p-alpha", chapterSlug: "ch-02-next" } });
  return ctx;
}

test("lists overdue first, then today, with no daily limit and no answers", async (t) => {
  const { root, a, b } = await setup(t);
  const before = await treeDigest(root);
  const due = await dueReviews(root, { today: "2026-10-05" });
  assert.equal(await treeDigest(root), before);
  assert.deepEqual(due.items.map((i) => [i.knowledgeId, i.timing]), [[a.id, "overdue"], [b.id, "today"]]);
  assert.equal(due.items[0].name, "TTL");
  assert.equal(JSON.stringify(due).includes("명제"), false);
  assert.equal(JSON.stringify(due).includes("설명"), false);
  const filtered = await dueReviews(root, { today: "2026-10-05", chapterSlug: "ch-02-next" });
  assert.deepEqual(filtered.items.map((i) => i.knowledgeId), [b.id]);
  const future = await dueReviews(root, { today: "2026-10-01", includeFuture: true });
  assert.deepEqual(future.items.map((i) => i.timing), ["future", "future"]);
  assert.equal((await dueReviews(root, { today: "2026-10-01" })).items.length, 0);
});

test("groups due items that share a chapter or an inference chain as candidates only", async (t) => {
  const { root } = await setup(t);
  const due = await dueReviews(root, { today: "2026-10-05" });
  assert.ok(due.groups.length >= 1);
  assert.ok(due.groups.every((g) => g.knowledgeIds.length >= 1));
});

test("completed and merged schedules are excluded", async (t) => {
  const { root, a } = await setup(t);
  const s = (await loadSchedule(root, a.id))!;
  await saveSchedule(root, { ...s, status: "completed", dueDate: null }, s);
  const due = await dueReviews(root, { today: "2026-10-30" });
  assert.equal(due.items.some((i) => i.knowledgeId === a.id), false);
});

test("the root review page shows names, dates and record links but no answers", async (t) => {
  const { root } = await setup(t);
  const path = await buildIntegratedReviewPage(root, { today: "2026-10-05" });
  const content = await readFile(path, "utf8");
  assert.match(content, /TTL/);
  assert.match(content, /기한 경과/);
  assert.match(content, /2026-10-02/);
  assert.doesNotMatch(content, /명제|설명/);
  assert.match(content, /하루 양 제한 없음/);
  const again = await buildIntegratedReviewPage(root, { today: "2026-10-05" });
  assert.equal(await readFile(again, "utf8"), content);
});

test("an unmanaged root review README is not overwritten", async (t) => {
  const { root } = await setup(t);
  await mkdir(join(root, "review"), { recursive: true });
  await writeFile(join(root, "review", "README.md"), "# 내 메모\n");
  await assert.rejects(buildIntegratedReviewPage(root, { today: "2026-10-05" }), /관리 구역/);
  assert.equal(await readFile(join(root, "review", "README.md"), "utf8"), "# 내 메모\n");
});
