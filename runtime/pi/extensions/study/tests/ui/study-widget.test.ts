import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { enroll } from "../../src/review/schedule.ts";
import { createStudyWidget, widgetLines } from "../../src/ui/study-widget.ts";
import { tempDir, workspaceFixture } from "../support/fixtures.ts";

function ui() {
  const calls: Array<[string, string[] | undefined]> = [];
  return {
    calls,
    ctx: (cwd: string, hasUI = true) => ({
      cwd,
      hasUI,
      ui: { setWidget: (k: string, l: string[] | undefined) => calls.push([k, l]) },
    }),
  };
}

test("shows project, chapter, phase, due reviews and channel in three short lines", async (t) => {
  const root = await workspaceFixture(t, { channel: "plannotator" });
  await enroll(root, { projectSlug: "study-alpha", chapterSlug: "ch-01-intro" }, "2026-10-01", [1]);
  const lines = await widgetLines(
    join(root, "study-alpha"),
    { chapterSlug: "ch-01-intro", phase: "concept" },
    { today: "2026-10-05" },
  );
  assert.equal(lines.length, 3);
  assert.match(lines[0], /study-alpha — ch-01-intro · concept/);
  assert.match(lines[1], /오늘 복습 1 \(\/study-review\) · 채널 plannotator/);
  assert.match(lines[2], /다음: 개념 학습/);
});

test("non-study directories and missing UI produce no widget", async (t) => {
  const dir = await tempDir(t);
  assert.deepEqual(await widgetLines(dir, null), []);
  const { calls, ctx } = ui();
  const widget = createStudyWidget();
  await widget.refresh(ctx(dir, false) as never);
  assert.deepEqual(calls, []);
  await widget.refresh(ctx(dir) as never);
  assert.deepEqual(calls, [["study-status", undefined]]);
});

test("target changes refresh the widget and dispose clears it", async (t) => {
  const root = await workspaceFixture(t);
  const { calls, ctx } = ui();
  const widget = createStudyWidget();
  widget.setTarget({ chapterSlug: "ch-01-intro", phase: "lab" });
  await widget.refresh(ctx(join(root, "study-alpha")) as never);
  assert.match(calls.at(-1)![1]!.join("\n"), /ch-01-intro · lab/);
  widget.dispose(ctx(root) as never);
  assert.deepEqual(calls.at(-1), ["study-status", undefined]);
});

test("widget failures never throw into the session", async () => {
  const widget = createStudyWidget();
  await widget.refresh({
    cwd: "/nonexistent/path/xyz",
    hasUI: true,
    ui: {
      setWidget() {
        throw new Error("boom");
      },
    },
  });
});
