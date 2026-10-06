import { loadPhaseInstructions } from "./phase-instructions.ts";

export type DiagnosisReviewContext = {
  id: string;
  chapterSlug: string;
  chapterTitle: string;
  diagnosisMdPath: string | null;
};

export async function buildDiagnosisReviewPrompt(session: DiagnosisReviewContext, payload: unknown): Promise<string> {
  const grade = (payload && typeof payload === "object" ? payload : {}) as {
    score?: number;
    maxScore?: number;
    level?: string;
    learningPreference?: "ready_to_continue" | "explain_first" | "practice_more" | "feels_guessed";
    weaknesses?: string[];
    learnerPinpoints?: Array<{
      id?: string;
      status?: string;
      score?: number;
      maxScore?: number;
      prompt?: string;
      comment?: string;
    }>;
  };
  const weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : [];
  const learnerPinpoints = Array.isArray(grade.learnerPinpoints) ? grade.learnerPinpoints : [];
  const lines = [
    "# DIAGNOSIS_RESULTS_REVIEWED",
    "",
    `- diagnosisId: ${session.id}`,
    `- chapterSlug: ${session.chapterSlug}`,
    `- chapterTitle: ${session.chapterTitle}`,
    `- 총점: ${grade.score ?? "?"}/${grade.maxScore ?? "?"}`,
  ];
  if (grade.level) lines.push(`- level: ${grade.level}`);
  if (grade.learningPreference) lines.push(`- learningPreference: ${grade.learningPreference}`);
  if (weaknesses.length) lines.push(`- 취약 분야: ${weaknesses.join(", ")}`);
  if (learnerPinpoints.length) {
    lines.push("- 학습자가 강조한 pinpoint:");
    for (const item of learnerPinpoints) {
      const label = item.id ?? "unknown";
      const score = item.score != null && item.maxScore != null ? ` (${item.score}/${item.maxScore}, ${item.status ?? "checked"})` : "";
      const comment = item.comment ? ` — ${item.comment}` : "";
      lines.push(`  - ${label}${score}: ${item.prompt ?? ""}${comment}`);
    }
  }
  if (session.diagnosisMdPath) lines.push(`- diagnosisMdPath: ${session.diagnosisMdPath}`);
  lines.push(
    "",
    "학습자가 브라우저에서 진단 결과(점수·정답·해설·보완 포인트)를 모두 확인했습니다.",
    grade.learningPreference === "explain_first"
      ? "학습자가 먼저 설명을 요청했습니다. 같은 회상 질문을 다시 요구하지 말고 쉬운 설명→예시→중간 상태→원리 순서로 설명하세요. 이해 확인은 이후 변형 문제에서 하세요."
      : "이제 diagnosis.md의 결과와 챕터 README의 학습 목표를 기준으로 개념 학습을 시작하세요.",
    "학습자가 강조한 pinpoint는 학습 범위 변경이나 우선순위 override가 아니라 비중 조절 신호입니다. 전체 개념 흐름은 유지하고, pinpoint와 연결된 개념의 설명 밀도·예시·확인 질문만 조금 늘립니다.",
    "",
    await loadPhaseInstructions("concept"),
  );
  return lines.join("\n");
}
