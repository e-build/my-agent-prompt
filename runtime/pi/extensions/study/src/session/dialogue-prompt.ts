import type { PlacementSummary } from "../project/project-manifest.ts";
import type { DiagnosisRun } from "./dialogue-state.ts";

/** Public placement summary for the chapter diagnosis prompt. Never includes criteria. */
export function buildPlacementStatus(placement: PlacementSummary): string {
  const skip = placement.skip.map((s) => (s.reason ? `${s.what} (${s.reason})` : s.what));
  return [
    "## 배치 진단 결과",
    "",
    `- 요약: ${placement.summary}`,
    `- 시작점: ${placement.startAt}`,
    `- 집중: ${placement.focus.join(", ") || "없음"}`,
    `- 건너뜀: ${skip.join("; ") || "없음"}`,
    `- 미확인: ${placement.unverified.join("; ") || "없음"}`,
    `- 질문 수: ${placement.questionCount}`,
    "- 배치 진단에서 확인된 갈래는 다시 묻지 말고, 미확인 항목과 이 챕터 고유 개념만 질문하세요.",
    "- 결과가 승인된 커리큘럼과 어긋나면 수정을 말로 제안하고, 동의하면 README·챕터를 고친 뒤 study_curriculum_open으로 재승인받으세요.",
  ].join("\n");
}

/** Resume status appended to the diagnosis phase prompt. Contains no criteria. */
export function buildDialogueStatus(
  args:
    | { registered: false }
    | { registered: true; projectSlug: string; run: DiagnosisRun | null; placement?: PlacementSummary | null },
): string {
  const base = dialogueStatus(args);
  if (!args.registered || !args.placement) return base;
  return `${buildPlacementStatus(args.placement)}\n\n${base}`;
}

function dialogueStatus(
  args: { registered: false } | { registered: true; projectSlug: string; run: DiagnosisRun | null },
): string {
  if (!args.registered)
    return [
      "## 대화형 진단 상태",
      "",
      "- 이 프로젝트는 등록된 study 루트에 속하지 않아 대화형 진단 기록(질문·응답·근거)을 저장할 수 없습니다.",
      "- 이 프로젝트는 아직 등록되지 않았습니다(/study-init 커리큘럼 승인 시 자동 등록). 등록 전에는 진단 결과를 이해 완료로 기록하지 마세요.",
    ].join("\n");
  const { run, projectSlug } = args;
  if (!run)
    return [
      "## 대화형 진단 상태",
      "",
      `- projectSlug: ${projectSlug}`,
      "- 아직 시도가 없습니다. 첫 질문을 study_question_prepare(purpose=diagnosis)로 준비하면 새 시도가 시작됩니다.",
    ].join("\n");
  const lines = [
    "## 대화형 진단 상태",
    "",
    `- projectSlug: ${projectSlug}`,
    `- 시도: ${run.id} (${run.status === "open" ? "진행 중" : "종료"})`,
    `- 준비한 질문: ${run.questionIds.length} / ${run.limit}`,
  ];
  if (run.questionIds.length) lines.push(`- 질문 ID: ${run.questionIds.join(", ")}`);
  if (run.status === "open") {
    lines.push(
      "- 이미 준비한 질문을 다시 낼 때는 같은 requestId를 쓰세요. 상한은 재개해도 초기화되지 않습니다.",
      "- 응답이 기록되지 않은 질문은 이어서 묻거나 미확인으로 남기세요. study_question_prepare / study_answer_record를 사용하세요.",
    );
  } else {
    lines.push(`- 종료 사유: ${run.endReason}`);
    if (run.route) lines.push(`- 학습 경로: ${run.route.summary} (시작: ${run.route.startAt})`);
    if (run.unverified.length) lines.push(`- 미확인: ${run.unverified.join("; ")}`);
    lines.push("- 진단은 끝났습니다. 다시 진단하려면 사용자 요청 후 study_learning_route action=start_diagnosis로 새 시도를 여세요.");
  }
  return lines.join("\n");
}
