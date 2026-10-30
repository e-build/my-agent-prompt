import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createStudyWidget, widgetLines } from "../../src/session/study-widget.ts";
import { registerSchedules } from "../../src/review/review-store.ts";
import { knowledgeWorkspace } from "../support/evidence-fixture.ts";
import { tempDir, treeDigest } from "../support/workspace-fixture.ts";

function ui() {
  const calls: Array<[string, string[] | undefined]> = [];
  return { calls, ctx: (cwd: string, hasUI = true) => ({ cwd, hasUI, ui: { setWidget: (k: string, l: string[] | undefined) => calls.push([k, l]) } }) };
}

test("shows chapter, phase, knowledge and due reviews in a few short lines", async (t) => {
  const { root, a } = await knowledgeWorkspace(t);
  await registerSchedules(root, { knowledgeIds: [a.id], completedOn: "2026-10-01", origin: { projectId: "p-alpha", chapterSlug: "ch-01-intro" } });
  const before = await treeDigest(root);
  const lines = await widgetLines(join(root, "study-alpha"), { chapterSlug: "ch-01-intro", phase: "concept" }, "2026-10-05");
  assert.equal(await treeDigest(root), before);
  assert.ok(lines.length <= 3);
  assert.match(lines.join("\n"), /study-alpha/);
  assert.match(lines.join("\n"), /ch-01-intro · concept/);
  assert.match(lines.join("\n"), /복습 1/);
  assert.match(lines.join("\n"), /지식 3/);
});

test("non-study directories and missing UI produce no widget", async (t) => {
  const dir = await tempDir(t);
  assert.deepEqual(await widgetLines(dir, null), []);
  const { calls, ctx } = ui();
  const widget = createStudyWidget();
  await widget.refresh(ctx(dir, false) as any);
  assert.deepEqual(calls, []);
  await widget.refresh(ctx(dir) as any);
  assert.deepEqual(calls, [["study-status", undefined]]);
});

test("target changes refresh the widget and dispose clears it", async (t) => {
  const { root } = await knowledgeWorkspace(t);
  const { calls, ctx } = ui();
  const widget = createStudyWidget();
  widget.setTarget({ chapterSlug: "ch-01-intro", phase: "diagnosis" });
  await widget.refresh(ctx(join(root, "study-alpha")) as any);
  assert.match(calls.at(-1)![1]!.join("\n"), /diagnosis/);
  widget.setTarget(null);
  widget.dispose(ctx(root) as any);
  assert.deepEqual(calls.at(-1), ["study-status", undefined]);
});

test("widget failures never throw into the session", async () => {
  const widget = createStudyWidget();
  await widget.refresh({ cwd: "/nonexistent/path/xyz", hasUI: true, ui: { setWidget() { throw new Error("boom"); } } } as any);
});
