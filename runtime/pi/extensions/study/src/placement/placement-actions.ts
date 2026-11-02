/** Tool-independent dispatch for study_placement; testable without the Pi host. */
import type { DiagnosisEndReason, LearningRoute } from "../session/dialogue-state.ts";
import type { PlacementAnswerInput, PlacementQuestionInput, PlacementStrand } from "./placement-state.ts";
import { publicPlacement } from "./placement-state.ts";
import { CONFIDENCE_RECORD_GUIDELINE, publicQuestionHint } from "../evidence/question-hints.ts";
import {
  finishPlacementRun,
  loadPlacement,
  preparePlacementQuestion,
  recordPlacementAnswerRun,
  startPlacement,
} from "./placement-store.ts";

export type PlacementAction = "get" | "start" | "prepare" | "record" | "finish";

export type PlacementResult = { text: string; details: unknown };

export const PLACEMENT_GUIDELINES = [
  "study_placement prepare가 반환한 공개 질문만 학습자에게 보여 주고, 답을 듣기 전에 채점 기준을 말하지 마세요.",
  "study_placement record에는 학습자가 실제로 쓴 답만 넣고, 비채점 질문은 result=unverified만 허용됩니다. 설명해 준 갈래는 확인된 것이 아닙니다.",
  CONFIDENCE_RECORD_GUIDELINE.replace("study_answer_record", "study_placement record"),
];

function parse<T>(json: string | undefined): T {
  if (!json) throw new Error("payloadJson이 필요합니다.");
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error("payloadJson이 올바른 JSON이 아닙니다.");
  }
}

export async function runPlacementAction(
  action: PlacementAction,
  projectRoot: string,
  payloadJson?: string,
): Promise<PlacementResult> {
  if (action === "get") {
    const run = await loadPlacement(projectRoot);
    const view = run ? publicPlacement(run) : null;
    return { text: view ? JSON.stringify(view, null, 2) : "배치 진단 기록이 없습니다.", details: view };
  }
  if (action === "start") {
    const payload = parse<{ projectSlug: string; strands: PlacementStrand[]; limit?: number }>(payloadJson);
    const run = await startPlacement(projectRoot, payload);
    return { text: `배치 진단 시작: ${run.id} (상한 ${run.limit}, 갈래 ${run.strands.length}개)`, details: run };
  }
  if (action === "prepare") {
    const payload = parse<Omit<PlacementQuestionInput, "at">>(payloadJson);
    const question = await preparePlacementQuestion(projectRoot, payload);
    return { text: `${JSON.stringify(question, null, 2)}\n\n${publicQuestionHint("diagnosis")}`, details: question };
  }
  if (action === "record") {
    const payload = parse<Omit<PlacementAnswerInput, "at">>(payloadJson);
    const run = await recordPlacementAnswerRun(projectRoot, payload);
    const answer = run.answers.at(-1)!;
    return {
      text: `응답 기록: ${answer.questionId} → ${answer.result} (${answer.assistance}${answer.confidence !== undefined ? `, 확신 ${Math.round(answer.confidence * 10)}/10` : ""}). 질문 ${run.questions.length}/${run.limit}`,
      details: run,
    };
  }
  const payload = parse<{ reason: DiagnosisEndReason; route?: LearningRoute; unverified?: string[] }>(payloadJson);
  const run = await finishPlacementRun(projectRoot, payload);
  return {
    text: `배치 진단 종료(${run.endReason}). 질문 ${run.questions.length}개, 미확인 ${run.unverified.length}건. 다음: 진단 요약을 학습자에게 확인받고 커리큘럼을 설계`,
    details: run,
  };
}
