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
import { applyMigration, previewMigration, undoMigration } from "./migration-plan.ts";

export type CommandUi = Pick<ExtensionCommandContext, "cwd" | "hasUI" | "isIdle"> & {
  ui: Pick<ExtensionCommandContext["ui"], "notify" | "confirm"> & Partial<Pick<ExtensionCommandContext["ui"], "select">>;
};

const SUBCOMMANDS: Array<{ value: string; description: string; children?: Array<[string, string]> }> = [
  { value: "inspect", description: "등록 상태 보기" },
  { value: "check", description: "깨진 연결·충돌·중단된 변경 검사" },
  { value: "init", description: "study 루트 등록 (미리 보기 후 확인)" },
  { value: "recover", description: "중단된 변경 정리", children: [["retry", "남은 변경 마저 적용"], ["rollback", "변경 전으로 되돌리기"]] },
  {
    value: "migrate",
    description: "기존 기록 이전",
    children: [["preview", "미리 보기 (파일 안 바뀜)"], ["apply", "미리 보기 digest로 적용"], ["undo", "이전 되돌리기"]],
  },
];

/** Argument completion: subcommand, then its option, each with a Korean description. */
export function workspaceCompletions(prefix: string) {
  const [first, second, ...rest] = prefix.split(/\s+/);
  if (rest.length) return null;
  if (second === undefined) {
    const items = SUBCOMMANDS.filter((c) => c.value.startsWith(first)).map((c) => ({ value: c.value, label: c.value, description: c.description }));
    return items.length ? items : null;
  }
  const children = SUBCOMMANDS.find((c) => c.value === first)?.children ?? [];
  const items = children
    .filter(([value]) => value.startsWith(second))
    .map(([value, description]) => ({ value: `${first} ${value}`, label: value, description }));
  return items.length ? items : null;
}

const MENU: Array<[string, string]> = [
  ["상태 보기", "inspect"],
  ["검사 — 깨진 연결·충돌·중단된 변경", "check"],
  ["중단된 변경 마저 적용", "recover retry"],
  ["기존 기록 이전 미리 보기", "migrate preview"],
];

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
  if (!args.trim() && ctx.hasUI && ctx.ui.select) {
    const choice = await ctx.ui.select("study 루트 관리", MENU.map(([label]) => label));
    const picked = MENU.find(([label]) => label === choice);
    if (!picked) return "취소했습니다.";
    args = picked[1];
  }
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
  if (command.action === "migrate") {
    const root = expandRoot(ctx.cwd, command.root);
    if (command.step === "preview") {
      const preview = await previewMigration(root);
      return `${preview.summary}${preview.blockers.length ? `\n\n적용 전 해결 필요:\n- ${preview.blockers.join("\n- ")}` : `\n\n적용하려면 사용자가 \`/study-workspace migrate apply ${preview.digest} ${command.root}\`를 실행하세요.`}`;
    }
    if (command.step === "apply") {
      const preview = await previewMigration(root);
      const approved = ctx.hasUI
        ? await ctx.ui.confirm("기존 기록 이전", `${preview.summary}\n\n원본 파일은 바꾸지 않고 등록 파일만 추가합니다. 진행할까요?`)
        : true;
      if (!approved) return "이전을 취소했습니다. 파일은 바뀌지 않았습니다.";
      const result = await applyMigration(root, { digest: command.digest, approved });
      return `기존 기록 이전 ${result.status}: ${result.migrationId} (되돌리기: /study-workspace migrate undo ${result.migrationId})`;
    }
    const approved = ctx.hasUI ? await ctx.ui.confirm("이전 되돌리기", `${command.migrationId}에서 추가한 파일만 제거합니다. 진행할까요?`) : true;
    if (!approved) return "되돌리기를 취소했습니다.";
    await undoMigration(root, command.migrationId);
    return `이전 되돌림: ${command.migrationId}`;
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
