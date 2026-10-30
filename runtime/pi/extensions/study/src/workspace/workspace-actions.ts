import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { listPendingPlans } from "./change-plan.ts";
import { inspectRecovery } from "./recovery.ts";
import { findWorkspaceRoot, projectRootOf, readWorkspace } from "./workspace-root.ts";
import type { WorkspaceProject } from "./workspace-types.ts";

export type WorkspaceInspection =
  | {
      registered: true;
      root: string;
      workspaceId: string;
      timezone: string;
      intervals: number[];
      projects: WorkspaceProject[];
      pendingPlans: number;
      message: string;
    }
  | { registered: false; message: string };

/** Read-only status for the current cwd or an explicit root. */
export async function inspectWorkspace(
  cwd: string,
  explicitRoot?: string,
): Promise<WorkspaceInspection> {
  const workspace = await findWorkspaceRoot(cwd, explicitRoot);
  if (!workspace)
    return {
      registered: false,
      message:
        "등록된 study 루트가 없습니다. 기존 기능은 그대로 쓸 수 있고, 공통 지식·통합 복습을 쓰려면 사용자가 `/study-workspace init <루트>`로 등록해야 합니다.",
    };
  const pending = await listPendingPlans(workspace.root);
  return {
    registered: true,
    root: workspace.root,
    workspaceId: workspace.manifest.workspaceId,
    timezone: workspace.manifest.timezone,
    intervals: workspace.manifest.review.intervals,
    projects: workspace.manifest.projects,
    pendingPlans: pending.length,
    message: `study 루트: ${workspace.root} (프로젝트 ${workspace.manifest.projects.length}개${pending.length ? `, 미완료 변경 ${pending.length}개` : ""})`,
  };
}

export type WorkspaceCheck = { root: string; issues: string[] };
export type ExtraCheck = (root: string) => Promise<string[]>;

/** Detect broken registrations and interrupted changes. Never repairs. */
export async function checkWorkspace(
  root: string,
  extraChecks: ExtraCheck[] = [],
): Promise<WorkspaceCheck> {
  const workspace = await readWorkspace(root);
  const issues: string[] = [];
  for (const project of workspace.manifest.projects) {
    try {
      if (!(await stat(projectRootOf(workspace, project))).isDirectory())
        issues.push(`프로젝트 경로가 디렉터리가 아닙니다: ${project.path}`);
    } catch {
      issues.push(`프로젝트 경로를 찾지 못했습니다: ${project.slug} (${project.path})`);
    }
  }
  for (const report of await inspectRecovery(workspace.root)) {
    issues.push(
      `미완료 변경 계획 ${report.planId}: ${report.files.map((f) => `${f.path}=${f.state}`).join(", ")}${report.recoverable ? "" : " (외부 변경 있음)"}`,
    );
  }
  for (const check of extraChecks) issues.push(...(await check(workspace.root)));
  return { root: workspace.root, issues };
}

export type WorkspaceCommand =
  | { action: "inspect" }
  | { action: "check" }
  | { action: "init"; root: string }
  | { action: "recover"; mode: "retry" | "rollback" }
  | { action: "migrate"; step: "preview"; root: string }
  | { action: "migrate"; step: "apply"; root: string; digest: string }
  | { action: "migrate"; step: "undo"; root: string; migrationId: string };

export function parseWorkspaceCommand(args: string): WorkspaceCommand {
  const [action = "inspect", value, third, fourth] = args.trim().split(/\s+/).filter(Boolean);
  if (action === "inspect") return { action };
  if (action === "check") return { action };
  if (action === "init") return { action, root: value ?? "." };
  if (action === "recover") {
    if (value && value !== "retry" && value !== "rollback")
      throw new Error("recover 방식은 retry 또는 rollback입니다.");
    return { action, mode: (value as "retry" | "rollback") ?? "retry" };
  }
  if (action === "migrate") {
    const step = value ?? "preview";
    if (step === "preview") return { action, step, root: third ?? "." };
    if (step === "apply" && third) return { action, step, digest: third, root: fourth ?? "." };
    if (step === "undo" && third) return { action, step, migrationId: third, root: fourth ?? "." };
    throw new Error("사용법: /study-workspace migrate preview [루트] | apply <digest> [루트] | undo <migrationId> [루트]");
  }
  throw new Error("사용법: /study-workspace inspect|init <루트>|check|recover [retry|rollback]|migrate preview|apply|undo");
}

export function expandRoot(cwd: string, value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return resolve(cwd, value);
}
