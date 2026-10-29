import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { findStudyProjectRoot } from "../project/project-root.ts";
import { findRecoverablePassedTest } from "../assessment/assessment-grade.ts";
import { projectPath } from "../project/project-path.ts";
import { validateChapterEvidence } from "../session/chapter-evidence.ts";
import { applyTestRecovery, syncReviewPhase } from "../session/study-state.ts";
import { buildReviewStartPage } from "./review-page.ts";

export function registerReviewTools(pi: ExtensionAPI) {
  // Legacy name remains an alias; neither tool generates a study pack.
  for (const name of ["study_review_refresh", "study_pack_refresh"]) {
    pi.registerTool({
      name,
      label: "Study Review Refresh",
      description: `${name === "study_pack_refresh" ? "Deprecated alias. " : ""}schedule.md를 읽어 정답 비노출 review/README.md를 갱신합니다. 기존 pack의 고유 회상 기록은 보존하며 새 pack은 생성하지 않습니다.`,
      promptSnippet:
        "Refresh review navigation from the canonical schedule without copying answers",
      parameters: Type.Object({ chapterSlug: Type.String({ description: "챕터 slug" }) }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const projectRoot = await findStudyProjectRoot(ctx?.cwd ?? process.cwd());
        return withFileMutationQueue(
          projectPath(projectRoot, params.chapterSlug, "review", "README.md"),
          async () => {
            const record = await findRecoverablePassedTest(projectRoot, params.chapterSlug);
            let recoveryLine = "";
            let recoveryWarning: string | undefined;
            if (record) {
              try {
                await validateChapterEvidence(projectRoot, params.chapterSlug);
                if (await applyTestRecovery(projectRoot, params.chapterSlug, record))
                  recoveryLine = `\n시험 상태 확인: completed (${record.score}/${record.maxScore})`;
              } catch (error) {
                recoveryWarning = error instanceof Error ? error.message : String(error);
              }
            }
            const path = await buildReviewStartPage(projectRoot, params.chapterSlug);
            await syncReviewPhase(projectRoot, params.chapterSlug);
            return {
              content: [
                {
                  type: "text",
                  text: `복습 시작 페이지 갱신: ${path}${recoveryLine}${recoveryWarning ? `\n학습 근거 확인 필요: ${recoveryWarning}` : ""}`,
                },
              ],
              details: { path, recoveryWarning },
            };
          },
        );
      },
    });
  }
}
