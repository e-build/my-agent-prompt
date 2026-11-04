import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { applyBookChange, type BookChangeRequest } from "./book-changes.ts";
import { bookPendingNotice } from "./book-pending.ts";
import { bookTree, formatTree, planChapter } from "./book-query.ts";

function parsePayload<T>(payloadJson: string | undefined): T {
  if (!payloadJson) throw new Error("payloadJson이 필요합니다.");
  try {
    return JSON.parse(payloadJson) as T;
  } catch {
    throw new Error("payloadJson이 올바른 JSON이 아닙니다.");
  }
}

export function registerBookTools(pi: ExtensionAPI): void {
  pi.on?.("session_start", async (_event, ctx) => {
    if (!ctx?.hasUI) return;
    // Informational only: never blocks the session or counts as an integrity issue.
    const notice = await bookPendingNotice(ctx.cwd).catch(() => null);
    if (notice) ctx.ui.notify(notice, "info");
  });
  pi.registerTool({
    name: "study_book",
    label: "Study Book",
    description:
      "개념 위계로 재구성하는 내 교과서(book/)를 조회(query)·챕터 배치 계획(plan)·변경(apply)합니다. apply는 operations 묶음을 changeId·reason과 함께 원자적으로 적용하며 undo로 되돌립니다. 최상위 영역과 사용자가 정한 개념의 이름·위치는 바꿀 수 없고 propose로 제안만 합니다.",
    promptSnippet: "Query, plan or apply the concept-tree textbook (book/) atomically",
    promptGuidelines: [
      "study_book apply는 에이전트 권한으로 실행됩니다. 최상위 영역 생성과 사용자 소유 개념의 이름·위치 변경은 거부되니 propose로 제안하세요.",
      "같은 지식(명제)은 교과서 한 페이지에만 속합니다. 이미 다른 페이지에 있으면 새 페이지를 만들지 말고 그 페이지를 보강하거나 move_member로 옮기세요.",
      "사용자가 직접 고친 본문은 덮어쓰지 않습니다. 거부되면 수정본을 받아들일지(adopt_page) 사용자에게 먼저 물으세요.",
    ],
    parameters: Type.Object({
      action: Type.Union([Type.Literal("query"), Type.Literal("plan"), Type.Literal("apply")]),
      payloadJson: Type.Optional(
        Type.String({
          description:
            "query: 없음. plan: {projectSlug,chapterSlug}. apply: {changeId,reason,operations:[{op:create|rename|move|retire|place|unplace|move_member|write_page|adopt_page|record_learned|propose,...}]} 또는 {changeId,reason,undo:<changeId>}. 같은 묶음에서 만든 개념은 create의 key로 이름 붙여 'key:<key>'로 가리킴. 기존 개념을 처음 바꿀 때 expectedRevisionId 필수.",
        }),
      ),
      workspaceRoot: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const workspace = await requireWorkspace(ctx?.cwd ?? process.cwd(), params.workspaceRoot);
      if (params.action === "query") {
        const tree = await bookTree(workspace.root);
        return { content: [{ type: "text", text: formatTree(tree) }], details: { tree } };
      }
      if (params.action === "plan") {
        const { projectSlug, chapterSlug } = parsePayload<{ projectSlug: string; chapterSlug: string }>(params.payloadJson);
        const plan = await planChapter(workspace.root, projectSlug, chapterSlug);
        const lines = [
          ...plan.pages.map((p) => `- 보강: ${p.path} (${p.conceptId}@${p.revisionId}) ← ${p.knowledge.map((k) => k.name).join(", ")}`),
          ...plan.unplaced.map((k) => `- 미배치: ${k.name} (${k.id})`),
          `- projectId: ${plan.projectId}`,
          `- 재료: ${plan.materials.readme}; lab ${plan.materials.lab.join(", ") || "없음"}; 문제 ${plan.materials.questions.length}개; 통과한 시험 ${plan.materials.tests.join(", ") || "없음"}`,
          "",
          plan.tree,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }], details: plan };
      }
      const result = await applyBookChange(workspace.root, "agent", parsePayload<BookChangeRequest>(params.payloadJson));
      return { content: [{ type: "text", text: `${result.status}: ${result.summary}${result.dashboardWarning ? `\n경고: ${result.dashboardWarning}` : ""}\nundo: {changeId:<새 id>, reason, undo:"${result.changeId}"}` }], details: result };
    },
  });
}
