import { validateChapterEvidence } from "./chapter-evidence.ts";
import { buildReviewStartPage } from "./review-page.ts";
import { loadStudyState, saveStudyState, updatePhaseState, type StudyPhaseStatus } from "./study-state.ts";
import type { RecoverablePassedTest } from "./assessment-grade.ts";

export async function completeAcknowledgedTest(
  projectRoot: string,
  chapterSlug: string,
  record: RecoverablePassedTest,
  passed: boolean,
): Promise<{ status: StudyPhaseStatus; evidenceError?: string; navigationWarning?: string; pagePath?: string }> {
  let status: StudyPhaseStatus = passed ? "completed" : "relearn_required";
  let evidenceError: string | undefined;
  if (passed) {
    try { await validateChapterEvidence(projectRoot, chapterSlug); }
    catch (error) {
      status = "blocked";
      evidenceError = error instanceof Error ? error.message : String(error);
    }
  }
  const state = await loadStudyState(projectRoot);
  updatePhaseState(state, chapterSlug, "test", {
    status, attempt: record.attempt, score: record.score, maxScore: record.maxScore, sessionId: record.id,
    reason: evidenceError ? `학습 근거 검증 실패: ${evidenceError}` : undefined,
  });
  await saveStudyState(projectRoot, state);
  if (status !== "completed") return { status, evidenceError };
  // Navigation is a derived artifact; failure cannot invalidate verified learning evidence.
  try { return { status, pagePath: await buildReviewStartPage(projectRoot, chapterSlug) }; }
  catch (error) { return { status, navigationWarning: error instanceof Error ? error.message : String(error) }; }
}
