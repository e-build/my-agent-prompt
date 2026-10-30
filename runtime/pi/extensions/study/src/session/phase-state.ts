import {
  loadStudyState,
  saveStudyState,
  updatePhaseState,
  type StudyPhase,
} from "./study-state.ts";

export type PhaseSaveResult = { saved: true } | { saved: false; error: string };

/**
 * Persist one phase transition. Failures are returned (and logged) instead of
 * being reported as success, so callers can tell the learner and stop.
 */
export async function updateProjectPhase(
  projectRoot: string,
  chapterSlug: string,
  phase: StudyPhase,
  status: Parameters<typeof updatePhaseState>[3]["status"],
  patch: Omit<Parameters<typeof updatePhaseState>[3], "status"> = {},
): Promise<PhaseSaveResult> {
  try {
    const state = await loadStudyState(projectRoot);
    updatePhaseState(state, chapterSlug, phase, { status, ...patch });
    await saveStudyState(projectRoot, state);
    return { saved: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[study] failed to persist phase state:", message);
    return { saved: false, error: message };
  }
}

/** Human-readable warning for tool output; empty when saved or when a stub returns nothing. */
export function phaseSaveWarning(result: PhaseSaveResult | void | undefined): string {
  return result && result.saved === false ? `\n⚠️ 진도 상태 저장 실패: ${result.error} — 다음 단계로 자동 진행하지 마세요.` : "";
}

export type UpdateProjectPhase = (
  ...args: Parameters<typeof updateProjectPhase>
) => Promise<PhaseSaveResult | void>;
