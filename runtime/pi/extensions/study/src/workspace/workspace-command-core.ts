import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { sha256 } from "./atomic-file.ts";
import { recoverAll } from "./recovery.ts";
import {
  checkWorkspace,
  expandRoot,
  inspectWorkspace,
  parseWorkspaceCommand,
  type ExtraCheck,
} from "./workspace-actions.ts";
import {
  applyWorkspaceRegistration,
  previewWorkspaceRegistration,
} from "./workspace-registration.ts";
import { requireWorkspace } from "./workspace-root.ts";

export type CommandUi = Pick<ExtensionCommandContext, "cwd" | "hasUI" | "isIdle"> & {
  ui: Pick<ExtensionCommandContext["ui"], "notify" | "confirm">;
};

/** Approval digest over the target root, files and their current content (IDs are random per preview). */
export function previewDigest(
  root: string,
  changes: Array<{ path: string; beforeSha256: string | null }>,
): string {
  return sha256(JSON.stringify([root, changes.map((c) => [c.path, c.beforeSha256])])).slice(0, 12);
}

/**
 * Writes happen only from this user-typed command: registration and recovery
 * show a preview and need confirmation (dialog, or `--confirm <digest>` without UI).
 */
export async function runWorkspaceCommand(
  args: string,
  ctx: CommandUi,
  extraChecks: ExtraCheck[] = [],
): Promise<string> {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const confirmIndex = tokens.indexOf("--confirm");
  const confirmDigest = confirmIndex >= 0 ? tokens[confirmIndex + 1] : undefined;
  const command = parseWorkspaceCommand(
    (confirmIndex >= 0 ? tokens.slice(0, confirmIndex) : tokens).join(" "),
  );
  if (command.action === "inspect") return (await inspectWorkspace(ctx.cwd)).message;
  if (command.action === "check") {
    const workspace = await requireWorkspace(ctx.cwd);
    const result = await checkWorkspace(workspace.root, extraChecks);
    return result.issues.length
      ? `검사 결과 문제 ${result.issues.length}건:\n- ${result.issues.join("\n- ")}`
      : `검사 통과: ${result.root}`;
  }
  if (command.action === "init") {
    const root = expandRoot(ctx.cwd, command.root);
    const preview = await previewWorkspaceRegistration(root);
    if (!preview.plan) return `이미 등록돼 있고 바꿀 내용이 없습니다: ${root}`;
    const digest = previewDigest(root, preview.plan.changes);
    const approved = ctx.hasUI
      ? await ctx.ui.confirm("study 루트 등록", `${preview.summary}\n\n이대로 등록할까요?`)
      : confirmDigest === digest;
    if (!approved)
      return ctx.hasUI
        ? "등록을 취소했습니다. 파일은 바뀌지 않았습니다."
        : `${preview.summary}\n\n승인하려면 \`/study-workspace init ${command.root} --confirm ${digest}\`를 실행하세요. 파일은 아직 바뀌지 않았습니다.`;
    const result = await applyWorkspaceRegistration(root, preview);
    return `study 루트 등록 ${result.status}: ${root}`;
  }
  const workspace = await requireWorkspace(ctx.cwd);
  const inspection = await inspectWorkspace(workspace.root);
  if (!inspection.registered || !inspection.pendingPlans) return "미완료 변경 계획이 없습니다.";
  const label = command.mode === "retry" ? "남은 변경 마저 적용" : "변경 전 상태로 복원";
  const digest = sha256(`${workspace.root}:${command.mode}:${inspection.pendingPlans}`).slice(0, 12);
  const approved = ctx.hasUI
    ? await ctx.ui.confirm("study 변경 복구", `미완료 변경 ${inspection.pendingPlans}건을 ${label}할까요? 외부에서 바뀐 파일은 건드리지 않습니다.`)
    : confirmDigest === digest;
  if (!approved)
    return ctx.hasUI
      ? "복구를 취소했습니다."
      : `승인하려면 \`/study-workspace recover ${command.mode} --confirm ${digest}\`를 실행하세요.`;
  const results = await recoverAll(workspace.root, command.mode);
  return results.map((r) => `${r.planId}: ${r.status}${"message" in r && r.message ? ` — ${r.message}` : ""}`).join("\n");
}
