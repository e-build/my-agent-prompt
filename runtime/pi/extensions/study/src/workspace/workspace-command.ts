import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkWorkspace, inspectWorkspace, workspaceHealthNotice, type ExtraCheck } from "./workspace-actions.ts";
import { requireWorkspace } from "./workspace-root.ts";

export function registerWorkspaceTools(pi: ExtensionAPI, extraChecks: ExtraCheck[] = []): void {
  pi.on?.("session_start", async (_event, ctx) => {
    if (!ctx?.hasUI) return;
    try {
      const notice = await workspaceHealthNotice(ctx.cwd, extraChecks);
      if (notice) ctx.ui.notify(notice, "warning");
    } catch (error) {
      ctx.ui.notify(`study 루트를 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  });

  pi.registerTool({
    name: "study_workspace",
    label: "Study Workspace",
    description:
      "study 루트 등록 상태(inspect)와 손상·미완료 변경(check)을 읽기 전용으로 확인합니다. 등록은 커리큘럼 승인 시 자동으로, 중단된 저장 정리는 사용자가 /study-chapter 메뉴에서 합니다.",
    promptSnippet: "Inspect or check the registered study workspace without writing",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("inspect"), Type.Literal("check")]),
      workspaceRoot: Type.Optional(Type.String({ description: "명시적 study 루트" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd ?? process.cwd();
      if (params.action === "inspect") {
        const result = await inspectWorkspace(cwd, params.workspaceRoot);
        return { content: [{ type: "text", text: result.message }], details: result };
      }
      const workspace = await requireWorkspace(cwd, params.workspaceRoot);
      const result = await checkWorkspace(workspace.root, extraChecks);
      return {
        content: [
          {
            type: "text",
            text: result.issues.length ? `문제 ${result.issues.length}건:\n- ${result.issues.join("\n- ")}` : "검사 통과",
          },
        ],
        details: result,
      };
    },
  });
}
