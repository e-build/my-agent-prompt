import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { applyKnowledgeChange, type ApplyOptions, type KnowledgeChangeRequest } from "./knowledge-changes.ts";
import { queryKnowledge, type KnowledgeQuery } from "./knowledge-query.ts";
import { requireItem } from "./knowledge-store.ts";
import { locateSources } from "./source-locator.ts";
import { labelCluster } from "./knowledge-clusters-store.ts";
import { buildKnowledgeView } from "./knowledge-view.ts";

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
      "같은 지식이 다른 자료·챕터에 다시 나오면 새로 만들지 말고 add_expression으로 기존 지식에 출처를 더하세요. 지식 영역은 챕터가 아니라 추론 연결로 정해집니다.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("query"),
        Type.Literal("apply"),
        Type.Literal("sources"),
        Type.Literal("regions"),
        Type.Literal("label_region"),
      ]),
      payloadJson: Type.Optional(
        Type.String({
          description:
            "regions: 연결 구조로 찾은 지식 영역 목록(이름 없는 영역 포함). label_region: {members,label,reason} — 영역 구성 지식의 이름·명제를 보고 짧은 이름(2~12자 권장)을 붙임. sources: {id} — 이 PC에서 출처 자료를 찾을 수 있는지 확인. query: {ids?,text?,status?,includeMerged?,detail?:'summary'|'full',limit?}. apply: {changeId,operation,reason,...} (create|add_expression|revise|set_status|merge|unmerge|undo|add_chain|retire_chain)",
        }),
      ),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = await requireWorkspace(ctx?.cwd ?? process.cwd(), params.workspaceRoot);
      if (params.action === "sources") {
        const { id } = parsePayload<{ id?: string }>(params.payloadJson, {});
        if (!id) throw new Error("sources에는 payloadJson {id}가 필요합니다.");
        const located = await locateSources(workspace.root, (await requireItem(workspace.root, id)).sources);
        return {
          content: [{ type: "text", text: located.map((l) => `- ${l.materialId}: ${l.status} — ${l.message}`).join("\n") || "출처 없음" }],
          details: located,
        };
      }
      if (params.action === "regions") {
        const view = await buildKnowledgeView(workspace.root);
        const names = new Map(view.nodes.map((n) => [n.id, n.label]));
        const regions = view.clusters.map((c) => ({ id: c.id, label: c.label, labelled: c.labelled, members: c.members.map((id) => ({ id, name: names.get(id) })) }));
        return {
          content: [{ type: "text", text: regions.map((r) => `- ${r.labelled ? r.label : "(이름 없음)"} [${r.members.length}]: ${r.members.map((m) => m.name).join(", ")}`).join("\n") || "영역 없음" }],
          details: { regions, orphans: view.orphans },
        };
      }
      if (params.action === "label_region") {
        const record = await labelCluster(workspace.root, parsePayload<{ members: string[]; label: string; reason: string }>(params.payloadJson, { members: [], label: "", reason: "" }));
        return { content: [{ type: "text", text: `영역 이름 저장: ${record.label} (${record.core.length}개)` }], details: record };
      }
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
