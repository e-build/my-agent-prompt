import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { applyKnowledgeChange, type ApplyOptions, type KnowledgeChangeRequest } from "./knowledge-changes.ts";
import { queryKnowledge, type KnowledgeQuery } from "./knowledge-query.ts";

function parsePayload<T>(payloadJson: string | undefined, fallback: T): T {
  if (!payloadJson) return fallback;
  try {
    return JSON.parse(payloadJson) as T;
  } catch {
    throw new Error("payloadJson이 올바른 JSON이 아닙니다.");
  }
}

export function registerKnowledgeTools(pi: ExtensionAPI, applyOptions: (root: string) => ApplyOptions = () => ({})) {
  pi.registerTool({
    name: "study_knowledge",
    label: "Study Knowledge",
    description:
      "등록된 study 루트의 공통 지식(명제)을 조회(query)하거나 변경(apply)합니다. apply는 changeId·reason·기대 revision이 필요하며 여러 파일을 한 번에 원자적으로 저장합니다. 학습자 답변을 지식으로 저장하지 마세요. 되돌리기는 operation=undo.",
    promptSnippet: "Query or apply versioned study knowledge (propositions, chains, merges)",
    promptGuidelines: [
      "study_knowledge apply는 자료·교재·교사 설명에서 확인한 명제만 다룹니다. 근거가 부족하면 status=uncertain으로 두고 확정 교재·채점 기준으로 쓰지 마세요.",
      "이름이 비슷하다는 이유만으로 merge하지 마세요. 주장·조건·범위가 같을 때만 merge하고, 모호하면 별도 항목으로 두세요.",
    ],
    parameters: Type.Object({
      action: Type.Union([Type.Literal("query"), Type.Literal("apply")]),
      payloadJson: Type.Optional(
        Type.String({
          description:
            "query: {ids?,text?,status?,includeMerged?,detail?:'summary'|'full',limit?}. apply: {changeId,operation,reason,...} (create|add_expression|revise|set_status|merge|unmerge|undo|add_chain|retire_chain)",
        }),
      ),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = await requireWorkspace(ctx?.cwd ?? process.cwd(), params.workspaceRoot);
      if (params.action === "query") {
        const result = await queryKnowledge(workspace.root, parsePayload<KnowledgeQuery>(params.payloadJson, {}));
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }
      const request = parsePayload<KnowledgeChangeRequest | null>(params.payloadJson, null);
      if (!request) throw new Error("apply에는 payloadJson이 필요합니다.");
      const result = await applyKnowledgeChange(workspace.root, request, applyOptions(workspace.root));
      return {
        content: [{ type: "text", text: `${result.status}: ${result.summary}` }],
        details: result,
      };
    },
  });
}
