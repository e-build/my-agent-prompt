import type { ChapterStart } from "../state/project-manifest.ts";
import type { PhaseStatus, StudyPhase } from "../state/study-state.ts";

export type PhaseRequest = {
  projectRoot: string;
  chapterSlug: string;
  chapterTitle: string;
  phase: StudyPhase;
  status: PhaseStatus;
  channel: string;
  placement?: ChapterStart;
  extra?: string[];
  warnings: string[];
  body: string;
};

const list = (values: string[]) => values.join(", ") || "없음";

/** Code-owned header, then the (possibly user-overridden) prompt body. */
export function buildPhaseRequest(request: PhaseRequest): string {
  const lines = [
    "# STUDY_PHASE_REQUEST",
    "",
    `- projectRoot: ${request.projectRoot}`,
    `- chapterSlug: ${request.chapterSlug}`,
    `- chapterTitle: ${request.chapterTitle}`,
    `- phase: ${request.phase}`,
    `- channel: ${request.channel}`,
    `- currentStatus: ${request.status}`,
    ...(request.extra ?? []),
  ];
  if (request.phase === "concept") {
    lines.push("", "## 이 챕터의 출발점 (배치 진단)", "");
    if (request.placement)
      lines.push(
        `- 시작점: ${request.placement.startAt}`,
        `- 건너뜀: ${list(request.placement.skip)}`,
        `- 집중: ${list(request.placement.focus)}`,
        `- 미확인: ${list(request.placement.unverified)}`,
      );
    else lines.push("- 배치 진단 기록 없음. 챕터 README의 학습 목표 순서대로 시작하세요.");
  }
  if (request.warnings.length) lines.push("", ...request.warnings.map((w) => `⚠️ ${w}`));
  lines.push("", request.body.trim());
  return lines.join("\n");
}
