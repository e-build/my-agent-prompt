import { validateChapterEvidence } from "../session/chapter-evidence.ts";
import { buildReviewStartPage } from "../review/review-page.ts";
import { registerChapterReviews } from "../review/chapter-review-registration.ts";
import { buildIntegratedReviewPage } from "../review/integrated-review-page.ts";
import { localDate } from "../review/review-date.ts";
import { findWorkspaceRoot, projectForPath } from "../workspace/workspace-root.ts";
import {
  loadStudyState,
  saveStudyState,
  updatePhaseState,
  type StudyPhaseStatus,
} from "../session/study-state.ts";
import type { RecoverablePassedTest } from "./assessment-grade.ts";

export type TestCompletionResult = {
  status: StudyPhaseStatus;
  evidenceError?: string;
  navigationWarning?: string;
  pagePath?: string;
  /** Integrated review registration (registered workspaces only). */
  review?: { created: string[]; existing: string[]; completedOn: string };
  reviewWarning?: string;
};

type ChapterCompletions = Record<string, { completedOn: string; completedAt: string; source: string }>;

export async function completeAcknowledgedTest(
  projectRoot: string,
  chapterSlug: string,
  record: RecoverablePassedTest,
  passed: boolean,
  options: { now?: () => Date } = {},
): Promise<TestCompletionResult> {
  let status: StudyPhaseStatus = passed ? "completed" : "relearn_required";
  let evidenceError: string | undefined;
  if (passed) {
    try {
      await validateChapterEvidence(projectRoot, chapterSlug);
    } catch (error) {
      status = "blocked";
      evidenceError = error instanceof Error ? error.message : String(error);
    }
  }
  const workspace = await findWorkspaceRoot(projectRoot).catch(() => null);
  const project = workspace ? projectForPath(workspace, projectRoot) : null;
  const now = (options.now ?? (() => new Date()))();
  const state = await loadStudyState(projectRoot);
  updatePhaseState(state, chapterSlug, "test", {
    status,
    attempt: record.attempt,
    score: record.score,
    maxScore: record.maxScore,
    sessionId: record.id,
    reason: evidenceError ? `학습 근거 검증 실패: ${evidenceError}` : undefined,
  });
  // The first verified completion day is immutable; retries never move it.
  let completedOn: string | undefined;
  if (status === "completed" && workspace && project) {
    const completions = ((state as Record<string, unknown>).chapterCompletions ?? {}) as ChapterCompletions;
    completedOn = completions[chapterSlug]?.completedOn ?? localDate(now, workspace.manifest.timezone);
    if (!completions[chapterSlug])
      completions[chapterSlug] = { completedOn, completedAt: now.toISOString(), source: `test:${record.id}` };
    (state as Record<string, unknown>).chapterCompletions = completions;
  }
  await saveStudyState(projectRoot, state);
  if (status !== "completed") return { status, evidenceError };

  if (workspace && project && completedOn) {
    // Test pass is an independent fact: review linking failures are warnings.
    try {
      const review = await registerChapterReviews(workspace.root, project.slug, chapterSlug, completedOn);
      let navigationWarning: string | undefined;
      let pagePath: string | undefined;
      try {
        pagePath = await buildIntegratedReviewPage(workspace.root);
      } catch (error) {
        navigationWarning = error instanceof Error ? error.message : String(error);
      }
      return { status, review: { ...review, completedOn }, pagePath, navigationWarning };
    } catch (error) {
      return { status, reviewWarning: error instanceof Error ? error.message : String(error) };
    }
  }
  // Navigation is a derived artifact; failure cannot invalidate verified learning evidence.
  try {
    return { status, pagePath: await buildReviewStartPage(projectRoot, chapterSlug) };
  } catch (error) {
    return { status, navigationWarning: error instanceof Error ? error.message : String(error) };
  }
}
