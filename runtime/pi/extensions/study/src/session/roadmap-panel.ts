import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findStudyProjectRoot } from "../project/project-root.ts";
import { readChapterCatalog } from "./chapter-catalog.ts";
import { parseRoadmap, roadmapRows, type RoadmapRow } from "./roadmap.ts";

type Theme = { fg(color: string, text: string): string };
type PanelUi = {
  notify(message: string, type?: "info" | "warning" | "error"): void;
  custom<T>(
    factory: (tui: any, theme: Theme, keybindings: unknown, done: (result: T) => void) => any,
    options?: { overlay?: boolean; overlayOptions?: () => Record<string, unknown>; onHandle?: (handle: any) => void },
  ): Promise<T>;
};
export type PanelContext = { cwd: string; mode?: string; hasUI: boolean; ui: PanelUi };

const PANEL_WIDTH = 46;
const MIN_TERMINAL_WIDTH = 110;

/** Display width with East Asian wide characters counted as two columns. */
function charWidth(ch: string): number {
  const code = ch.codePointAt(0)!;
  return (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
    ? 2
    : 1;
}

function fit(text: string, width: number): string {
  let out = "";
  let used = 0;
  for (const ch of text) {
    const w = charWidth(ch);
    if (used + w > width) {
      while (used + 1 > width && out) {
        const last = [...out].at(-1)!;
        out = out.slice(0, -last.length);
        used -= charWidth(last);
      }
      return `${out}…${" ".repeat(Math.max(0, width - used - 1))}`;
    }
    out += ch;
    used += w;
  }
  return out + " ".repeat(width - used);
}

/** Bordered panel lines; every line is exactly `width` columns wide. */
export function renderPanel(rows: RoadmapRow[], width: number, theme: Theme): string[] {
  const inner = Math.max(4, width - 4);
  const border = (s: string) => theme.fg("border", s);
  const title = " 학습 로드맵 ";
  const top = `╭─${title}${"─".repeat(Math.max(0, width - 3 - [...title].reduce((w, c) => w + charWidth(c), 0)))}╮`;
  return [
    border(fit(top, width)),
    ...rows.map((row) => `${border("│")} ${theme.fg(row.tone, fit(row.text, inner))} ${border("│")}`),
    border(`╰${"─".repeat(width - 2)}╯`),
  ];
}

async function loadRows(projectRoot: string, maxRows: number): Promise<RoadmapRow[]> {
  const catalog = await readChapterCatalog(projectRoot);
  let readme = "";
  try {
    readme = await readFile(join(projectRoot, "README.md"), "utf8");
  } catch {
    readme = "";
  }
  return roadmapRows(parseRoadmap(readme, catalog), catalog, { maxRows });
}

/**
 * Right-side project roadmap that does not take keyboard focus. The same
 * command toggles it; it hides itself on narrow terminals and redraws after
 * each turn so phase changes show up without reopening.
 */
export function createRoadmapPanel() {
  let close: (() => void) | null = null;
  let reload: (() => Promise<void>) | null = null;
  return {
    isOpen: () => close !== null,
    async toggle(ctx: PanelContext): Promise<"opened" | "closed" | "unavailable"> {
      if (close) {
        close();
        return "closed";
      }
      if (!ctx.hasUI || (ctx.mode && ctx.mode !== "tui")) {
        ctx.ui.notify("학습 로드맵 패널은 터미널(TUI) 화면에서만 열 수 있습니다.", "warning");
        return "unavailable";
      }
      let projectRoot: string;
      try {
        projectRoot = await findStudyProjectRoot(ctx.cwd);
      } catch {
        ctx.ui.notify("학습 프로젝트 폴더 안에서 실행하세요. 로드맵은 프로젝트 하나의 챕터 흐름을 보여 줍니다.", "warning");
        return "unavailable";
      }
      let rows = await loadRows(projectRoot, 40);
      let opened!: () => void;
      const ready = new Promise<void>((resolve) => (opened = resolve));
      void ctx.ui
        .custom<void>(
          (tui, theme, _keys, done) => {
            const maxRows = () => Math.max(10, (tui?.terminal?.rows ?? 40) - 4);
            close = () => {
              close = null;
              reload = null;
              done();
            };
            reload = async () => {
              rows = await loadRows(projectRoot, maxRows());
              tui?.requestRender?.();
            };
            void reload();
            opened();
            return {
              render: (width: number) => renderPanel(rows, Math.min(width, PANEL_WIDTH), theme),
              invalidate() {},
            };
          },
          {
            overlay: true,
            overlayOptions: () => ({
              anchor: "right-center",
              width: PANEL_WIDTH,
              maxHeight: "90%",
              margin: { right: 1 },
              nonCapturing: true,
              visible: (termWidth: number) => termWidth >= MIN_TERMINAL_WIDTH,
            }),
          },
        )
        .catch(() => {
          close = null;
          reload = null;
        });
      await ready;
      return "opened";
    },
    async refresh() {
      await reload?.().catch(() => {});
    },
    dispose() {
      close?.();
    },
  };
}

export type RoadmapPanel = ReturnType<typeof createRoadmapPanel>;
