import type { StudyPhase } from "./study-state.ts";

export type GuardTarget = { chapterSlug: string; phase: StudyPhase };

/**
 * The completion exam must use the browser test (study_test_open). If a test
 * turn ends without it, send one corrective follow-up. Diagnosis is
 * conversational now and is not forced into the legacy HTML flow.
 */
export function createAssessmentOpenGuard(deps: {
  send: (message: string) => void;
  hasOpenSession: (target: GuardTarget) => boolean;
}) {
  let target: GuardTarget | null = null;
  let observed = false;
  let nudged = false;
  return {
    setTarget(next: GuardTarget) {
      target = next;
      observed = false;
      nudged = false;
    },
    clear() {
      target = null;
    },
    onToolEnd(toolName: string) {
      if (toolName === "study_test_open") observed = true;
    },
    markOpened() {
      observed = true;
    },
    onTurnEnd() {
      if (!target || nudged || target.phase !== "test") return;
      if (observed || deps.hasOpenSession(target)) {
        observed = true;
        return;
      }
      nudged = true;
      deps.send(
        `# STUDY_ASSESSMENT_OPEN_REQUIRED\n\n- chapterSlug: ${target.chapterSlug}\n- phase: test\n\n완료 시험은 브라우저 시험이 필수입니다. 문항 JSON을 구성한 뒤 반드시 study_test_open을 호출하세요. markdown 직접 답안 방식으로 진행하지 마세요.`,
      );
    },
  };
}
