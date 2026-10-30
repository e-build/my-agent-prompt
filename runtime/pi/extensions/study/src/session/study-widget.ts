import { basename } from "node:path";
import { listItemIds } from "../knowledge/knowledge-store.ts";
import { dueReviews } from "../review/review-query.ts";
import { findStudyProjectRoot } from "../project/project-root.ts";
import { findWorkspaceRoot, projectForPath } from "../workspace/workspace-root.ts";
import type { StudyPhase } from "./study-state.ts";

export const WIDGET_KEY = "study-status";
type Target = { chapterSlug: string; phase: StudyPhase } | null;
type WidgetContext = {
  cwd: string;
  hasUI: boolean;
  ui: { setWidget(key: string, lines: string[] | undefined): void };
};

const NEXT: Record<StudyPhase, string> = {
  diagnosis: "다음: 대화형 진단",
  concept: "다음: 개념 학습",
  lab: "다음: 프로젝트 실습",
  test: "다음: 완료 시험",
  review: "다음: 복습",
};

/** Read-only, at most three short lines. Empty when not inside study material. */
export async function widgetLines(cwd: string, target: Target, today?: string): Promise<string[]> {
  const workspace = await findWorkspaceRoot(cwd).catch(() => null);
  let projectLabel: string | null = null;
  if (workspace) projectLabel = projectForPath(workspace, cwd)?.slug ?? null;
  if (!projectLabel) projectLabel = await findStudyProjectRoot(cwd).then(basename).catch(() => null);
  if (!projectLabel && !workspace) return [];
  const first = [`📚 ${projectLabel ?? "study"}`, target ? `${target.chapterSlug} · ${target.phase}` : null].filter(Boolean).join(" — ");
  const lines = [first];
  if (workspace) {
    const [ids, due] = await Promise.all([
      listItemIds(workspace.root).catch(() => []),
      dueReviews(workspace.root, today ? { today } : {}).catch(() => ({ items: [] as unknown[] })),
    ]);
    lines.push(`지식 ${ids.length} · 오늘 복습 ${due.items.length}${due.items.length ? " (/study-review)" : ""}`);
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
        /* ignore */
      }
    },
  };
}
