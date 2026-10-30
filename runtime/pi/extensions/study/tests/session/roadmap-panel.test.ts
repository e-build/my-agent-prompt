import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createRoadmapPanel, renderPanel } from "../../src/session/roadmap-panel.ts";
import { workspaceFixture } from "../support/workspace-fixture.ts";

const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t } as any;

function fakeUi() {
  const opened: Array<{ options: any; component: any; done: (v: unknown) => void; handle: any }> = [];
  const notices: string[] = [];
  const ui = {
    notify: (m: string) => notices.push(m),
    custom: (factory: any, options: any) =>
      new Promise((resolve) => {
        const tui = { requestRender() {}, terminal: { rows: 30 } };
        const done = (v: unknown) => resolve(v);
        const component = factory(tui, theme, {}, done);
        const handle = { hidden: false, setHidden(h: boolean) { this.hidden = h; } };
        options.onHandle?.(handle);
        opened.push({ options, component, done, handle });
      }),
  };
  return { ui, opened, notices };
}

test("toggle opens a non-capturing right panel, then closes it", async (t) => {
  const root = await workspaceFixture(t);
  const panel = createRoadmapPanel();
  const { ui, opened } = fakeUi();
  const ctx = { cwd: join(root, "study-alpha"), mode: "tui", hasUI: true, ui } as any;
  assert.equal(await panel.toggle(ctx), "opened");
  assert.equal(opened.length, 1);
  assert.equal(opened[0].options.overlay, true);
  const o = opened[0].options.overlayOptions();
  assert.equal(o.anchor, "right-center");
  assert.equal(o.nonCapturing, true);
  assert.equal(typeof o.visible, "function");
  assert.equal(o.visible(60, 30), false);
  assert.equal(o.visible(140, 30), true);
  const lines = opened[0].component.render(40).join("\n");
  assert.match(lines, /study-alpha/);
  assert.match(lines, /01 Intro/);
  assert.equal(await panel.toggle(ctx), "closed");
  assert.equal(panel.isOpen(), false);
});

test("outside a study project it explains instead of opening", async (t) => {
  const panel = createRoadmapPanel();
  const { ui, opened, notices } = fakeUi();
  assert.equal(await panel.toggle({ cwd: "/", mode: "tui", hasUI: true, ui } as any), "unavailable");
  assert.equal(opened.length, 0);
  assert.match(notices[0], /학습 프로젝트/);
});

test("non-TUI modes do not try to draw a panel", async (t) => {
  const root = await workspaceFixture(t);
  const panel = createRoadmapPanel();
  const { ui, opened, notices } = fakeUi();
  assert.equal(await panel.toggle({ cwd: join(root, "study-alpha"), mode: "rpc", hasUI: true, ui } as any), "unavailable");
  assert.equal(opened.length, 0);
  assert.match(notices[0], /터미널/);
});

test("refresh redraws an open panel with the latest state and dispose closes it", async (t) => {
  const root = await workspaceFixture(t);
  const panel = createRoadmapPanel();
  const { ui, opened } = fakeUi();
  const ctx = { cwd: join(root, "study-alpha"), mode: "tui", hasUI: true, ui } as any;
  await panel.toggle(ctx);
  await panel.refresh();
  panel.dispose();
  assert.equal(panel.isOpen(), false);
  assert.equal(opened.length, 1);
});

test("rendered lines never exceed the panel width and carry a border", () => {
  const lines = renderPanel([{ text: "아주 긴 한글 챕터 제목이 패널 너비를 넘어서는 경우를 확인", tone: "text" }], 24, theme);
  // Hangul syllables are two columns; box-drawing characters and the ellipsis are one.
  const visibleWidth = (s: string) => [...s].reduce((w, ch) => w + (/[\uac00-\ud7a3]/.test(ch) ? 2 : 1), 0);
  assert.deepEqual(lines.map(visibleWidth), [24, 24, 24]);
  assert.match(lines[0], /^╭/);
  assert.match(lines.at(-1)!, /^╰/);
});
