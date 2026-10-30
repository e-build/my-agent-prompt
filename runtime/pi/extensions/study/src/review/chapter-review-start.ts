import { executePlan, preparePlan } from "../workspace/change-plan.ts";
import { findWorkspaceRoot, projectForPath } from "../workspace/workspace-root.ts";
import { loadStudyState, updatePhaseState } from "../session/study-state.ts";
import type { ChapterCommandHooks } from "../session/study-command.ts";
import { registerChapterReviews } from "./chapter-review-registration.ts";
import { addCalendarDays, localDate } from "./review-date.ts";

async function workspaceProject(projectRoot: string) {
  const workspace = await findWorkspaceRoot(projectRoot).catch(() => null);
  const project = workspace ? projectForPath(workspace, projectRoot) : null;
  return workspace && project ? { workspace, project } : null;
}

/**
 * Manual review start for an already finished chapter (e.g. a legacy chapter
 * whose recorded completion time is unreliable): the base date is the day
 * the learner asks, never a reconstructed past date.
 */
export async function startChapterReview(projectRoot: string, chapterSlug: string, now = () => new Date()): Promise<string> {
  const found = await workspaceProject(projectRoot);
  if (!found) return "등록된 study 루트가 아니어서 통합 복습을 시작할 수 없습니다. /study-workspace init 후 다시 시도하세요.";
  const { workspace, project } = found;
  const today = localDate(now(), workspace.manifest.timezone);
  let created: string[];
  let existing: string[];
  try {
    ({ created, existing } = await registerChapterReviews(workspace.root, project.slug, chapterSlug, today));
  } catch (error) {
    return `${error instanceof Error ? error.message : String(error)} — /study-chapter로 개념 단계를 열어 교재와 지식을 연결하면 복습을 시작할 수 있습니다.`;
  }
  const state = await loadStudyState(projectRoot);
  updatePhaseState(state, chapterSlug, "review", { status: "in_progress", reason: `통합 복습 수동 시작 (기준일 ${today})` });
  const plan = await preparePlan(workspace.root, `review-start-${project.id}-${chapterSlug}-${today}`, [
    { path: `${project.path}/.study/state.json`, after: `${JSON.stringify(state, null, 2)}\n` },
  ], { projectPaths: [project.path] });
  await executePlan(workspace.root, plan);
  return `복습 시작: 새 일정 ${created.length}개, 기존 일정 유지 ${existing.length}개. 첫 복습 ${addCalendarDays(today, workspace.manifest.review.intervals[0])} — 그날 /study-review`;
}

/** Turn a stale legacy HTML diagnosis into a fresh conversational one. Records the reason. */
export async function restartStaleDiagnosis(projectRoot: string, chapterSlug: string): Promise<void> {
  const found = await workspaceProject(projectRoot);
  if (!found) throw new Error("등록된 study 루트가 아니어서 대화형 진단을 시작할 수 없습니다.");
  const state = await loadStudyState(projectRoot);
  const previous = state.chapters[chapterSlug]?.diagnosis;
  updatePhaseState(state, chapterSlug, "diagnosis", {
    status: "not_started",
    sessionId: undefined,
    reason: `예전 HTML 진단(${previous?.status ?? "?"}${previous?.sessionId ? `, ${previous.sessionId}` : ""})이 멈춰 있어 대화형 진단으로 다시 시작`,
  });
  const plan = await preparePlan(found.workspace.root, `diagnosis-restart-${found.project.id}-${chapterSlug}-${Date.now()}`, [
    { path: `${found.project.path}/.study/state.json`, after: `${JSON.stringify(state, null, 2)}\n` },
  ], { projectPaths: [found.project.path] });
  await executePlan(found.workspace.root, plan);
}

export function chapterReviewHooks(now?: () => Date): Omit<ChapterCommandHooks, "onTarget" | "hasLiveDiagnosis"> {
  return {
    isRegistered: async (projectRoot) => !!(await workspaceProject(projectRoot)),
    startReview: (projectRoot, chapterSlug) => startChapterReview(projectRoot, chapterSlug, now),
    restartDiagnosis: restartStaleDiagnosis,
  };
}
