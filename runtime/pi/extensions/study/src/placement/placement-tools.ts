import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { PLACEMENT_GUIDELINES, runPlacementAction } from "./placement-actions.ts";

export function registerPlacementTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: "study_placement",
    label: "Study Placement",
    description:
      "/study-init의 배치 진단(커리큘럼 확정 전, 프로젝트 등록 전)을 프로젝트 디렉터리 .study/placement.json에 기록합니다. start(갈래 등록) → prepare(채점 기준을 먼저 저장하고 공개 질문만 반환) → record(학습자의 실제 답) → finish(종료 사유·시작점·미확인). get은 채점 기준을 제외한 공개 부분만 반환합니다.",
    promptSnippet: "Record the pre-curriculum placement diagnosis in the unregistered project directory",
    promptGuidelines: PLACEMENT_GUIDELINES,
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("get"),
        Type.Literal("start"),
        Type.Literal("prepare"),
        Type.Literal("record"),
        Type.Literal("finish"),
      ]),
      projectRoot: Type.String({ description: "학습 프로젝트 루트의 절대 경로. 등록 전이라 필수." }),
      payloadJson: Type.Optional(
        Type.String({
          description:
            "start: {projectSlug,strands:[{id,name,why}],limit?}. prepare: {requestId,strandId,prompt,options?,scored,criteria?:{answer,acceptable,rubric,conditions}}. record: {questionId,response,responseAnchor,assistance,result,reason?}. finish: {reason,route?:{summary,startAt,focus,skip},unverified}",
        }),
      ),
    }),
    async execute(_id, params) {
      const result = await runPlacementAction(params.action, params.projectRoot, params.payloadJson);
      return { content: [{ type: "text", text: result.text }], details: result.details };
    },
  });
}
