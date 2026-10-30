import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { projectForPath, requireWorkspace } from "../workspace/workspace-root.ts";
import { finishConcept, type ConceptCompletion } from "./concept-completion.ts";
import { currentRun, finishDiagnosisRun, loadDialogue, startDiagnosisAttempt } from "./dialogue-store.ts";
import type { DiagnosisEndReason, LearningRoute } from "./dialogue-state.ts";

function parse<T>(json: string | undefined): T {
  if (!json) throw new Error("payloadJson이 필요합니다.");
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error("payloadJson이 올바른 JSON이 아닙니다.");
  }
}

export function registerLearningRouteTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: "study_learning_route",
    label: "Study Learning Route",
    description:
      "대화형 진단의 상태 조회(get), 종료와 학습 경로 기록(finish_diagnosis), 명시적 새 진단 시도(start_diagnosis), 개념 학습 완료 처리(finish_concept)를 수행합니다. 진단은 학습 경로를 정할 수 있으면 문항 수와 무관하게 종료합니다.",
    promptSnippet: "Get or finish the conversational diagnosis route, or complete the concept phase",
    promptGuidelines: [
      "study_learning_route finish_diagnosis의 reason은 route_decided(경로 결정)·limit_reached(상한 도달)·user_request(사용자 요청) 중 실제 사유를 쓰고, 확인하지 못한 부분은 unverified에 남기세요.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("get"),
        Type.Literal("finish_diagnosis"),
        Type.Literal("start_diagnosis"),
        Type.Literal("finish_concept"),
      ]),
      chapterSlug: Type.String(),
      projectSlug: Type.Optional(Type.String()),
      payloadJson: Type.Optional(
        Type.String({
          description:
            "finish_diagnosis: {reason,route?:{summary,startAt,focus,skip},unverified}. finish_concept: {regionIds?,uncertain?,summary}",
        }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd ?? process.cwd();
      const workspace = await requireWorkspace(cwd);
      const slug = params.projectSlug ?? projectForPath(workspace, cwd)?.slug;
      if (!slug) throw new Error("프로젝트를 정할 수 없습니다. projectSlug를 지정하세요.");
      if (params.action === "get") {
        const run = currentRun(await loadDialogue(workspace.root, slug, params.chapterSlug));
        return { content: [{ type: "text", text: JSON.stringify(run, null, 2) }], details: run };
      }
      if (params.action === "start_diagnosis") {
        const run = await startDiagnosisAttempt(workspace.root, slug, params.chapterSlug);
        return { content: [{ type: "text", text: `새 진단 시도 시작: ${run.id} (상한 ${run.limit})` }], details: run };
      }
      if (params.action === "finish_diagnosis") {
        const payload = parse<{ reason: DiagnosisEndReason; route?: LearningRoute; unverified?: string[] }>(params.payloadJson);
        const run = await finishDiagnosisRun(workspace.root, slug, params.chapterSlug, {
          reason: payload.reason,
          route: payload.route,
          unverified: payload.unverified ?? [],
        });
        return {
          content: [{ type: "text", text: `진단 종료(${run.endReason}). 질문 ${run.questionIds.length}개. 다음: 개념 학습` }],
          details: run,
        };
      }
      const result = await finishConcept(workspace.root, slug, params.chapterSlug, parse<ConceptCompletion>(params.payloadJson));
      return { content: [{ type: "text", text: result.message }], details: result };
    },
  });
}
