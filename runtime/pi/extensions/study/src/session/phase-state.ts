import {
  loadStudyState,
  saveStudyState,
  updatePhaseState,
  type StudyPhase,
} from "./study-state.ts";

export async function updateProjectPhase(
  projectRoot: string,
  chapterSlug: string,
  phase: StudyPhase,
  status: Parameters<typeof updatePhaseState>[3]["status"],
  patch: Omit<Parameters<typeof updatePhaseState>[3], "status"> = {},
): Promise<void> {
  try {
    const state = await loadStudyState(projectRoot);
    updatePhaseState(state, chapterSlug, phase, { status, ...patch });
    await saveStudyState(projectRoot, state);
  } catch (error) {
    console.warn("[study] failed to persist phase state:", error);
  }
}

export type UpdateProjectPhase = typeof updateProjectPhase;
