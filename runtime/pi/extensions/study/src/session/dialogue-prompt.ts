import type { DiagnosisRun } from "./dialogue-state.ts";

/** Resume status appended to the diagnosis phase prompt. Contains no criteria. */
export function buildDialogueStatus(
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
