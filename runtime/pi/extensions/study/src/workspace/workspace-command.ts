import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkWorkspace, inspectWorkspace, type ExtraCheck } from "./workspace-actions.ts";
import { runWorkspaceCommand } from "./workspace-command-core.ts";
import { requireWorkspace } from "./workspace-root.ts";

export function registerWorkspaceCommand(pi: ExtensionAPI, extraChecks: ExtraCheck[] = []): void {
  pi.registerCommand("study-workspace", {
    description: "study 루트 확인·등록·검사·중단 복구 (inspect|init <루트>|check|recover)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("현재 agent 응답이 끝난 뒤 다시 실행하세요.", "warning");
        return;
      }
      try {
        ctx.ui.notify(await runWorkspaceCommand(args, ctx, extraChecks), "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerTool({
    name: "study_workspace",
    label: "Study Workspace",
    description:
      "study 루트 등록 상태(inspect)와 손상·미완료 변경(check)을 읽기 전용으로 확인합니다. 등록·복구는 사용자가 /study-workspace 명령으로만 수행합니다.",
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
