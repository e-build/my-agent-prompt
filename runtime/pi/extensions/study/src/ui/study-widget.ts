import { basename } from "node:path";
import { todayIn } from "../flow/flow-actions.ts";
import { due } from "../review/schedule.ts";
import { findWorkspaceRoot } from "../review/workspace.ts";
import { findStudyProjectRoot } from "../state/project-root.ts";
import type { StudyPhase } from "../state/study-state.ts";

export const WIDGET_KEY = "study-status";
type Target = { chapterSlug: string; phase: StudyPhase } | null;
type WidgetContext = {
  cwd: string;
  hasUI: boolean;
  ui: { setWidget(key: string, lines: string[] | undefined): void };
};

const NEXT: Record<StudyPhase, string> = {
  concept: "다음: 개념 학습",
  lab: "다음: 프로젝트 실습",
  test: "다음: 완료 시험",
  review: "다음: 복습",
};

/** Read-only, at most three short lines. Empty when not inside study material. */
export async function widgetLines(
  cwd: string,
  target: Target,
  options: { today?: string; channel?: string } = {},
): Promise<string[]> {
  const workspace = await findWorkspaceRoot(cwd).catch(() => null);
  const project = await findStudyProjectRoot(cwd).then(basename).catch(() => null);
  if (!project && !workspace) return [];
  const head = [`📚 ${project ?? "study"}`, target ? `${target.chapterSlug} · ${target.phase}` : null]
    .filter(Boolean)
    .join(" — ");
  const lines = [head];
  if (workspace) {
    const today = options.today ?? todayIn(workspace.timezone);
    const count = (await due(workspace.root, today).catch(() => [])).length;
    const channel = options.channel ?? workspace.channel ?? "chat";
    lines.push(`오늘 복습 ${count}${count ? " (/study-review)" : ""} · 채널 ${channel}`);
  }
  lines.push(target ? `${NEXT[target.phase]} · 메뉴: /study-chapter` : "메뉴: /study-chapter");
  return lines;
}

export function createStudyWidget() {
  let target: Target = null;
  let generation = 0;
  return {
    setTarget(next: Target) {
      target = next;
    },
    async refresh(ctx: WidgetContext) {
      if (!ctx.hasUI) return;
      const current = ++generation;
      try {
        const lines = await widgetLines(ctx.cwd, target);
        if (current !== generation) return;
        ctx.ui.setWidget(WIDGET_KEY, lines.length ? lines : undefined);
      } catch {
        // Display failures never block learning.
      }
    },
    dispose(ctx: WidgetContext) {
      generation++;
      target = null;
      try {
        if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
      } catch {
        // Display failures never block shutdown.
      }
    },
  };
}
