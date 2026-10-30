import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { listPendingPlans } from "./change-plan.ts";
import { inspectRecovery } from "./recovery.ts";
import { findWorkspaceRoot, projectRootOf, readWorkspace } from "./workspace-root.ts";
import type { WorkspaceProject } from "./workspace-types.ts";
import { readTextOptional } from "./atomic-file.ts";

/** A project.json must name its own directory and (once registered) carry the registered ID. */
export async function projectManifestIssues(root: string, project: Pick<WorkspaceProject, "path" | "slug"> & { id?: string }): Promise<string[]> {
  const relative = `${project.path}/.study/project.json`;
  const content = await readTextOptional(join(root, ...relative.split("/")));
  if (content === null) return [];
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(content);
  } catch {
    return [`project.json이 손상됐습니다: ${relative}`];
  }
  const issues: string[] = [];
  if (manifest.projectSlug !== project.slug)
    issues.push(`${relative}의 projectSlug(${JSON.stringify(manifest.projectSlug)})가 디렉터리 이름(${project.slug})과 다릅니다. 이 프로젝트의 명령이 실패합니다.`);
  if (project.id && manifest.projectId !== undefined && manifest.projectId !== project.id)
    issues.push(`${relative}의 projectId(${manifest.projectId})가 workspace 등록(${project.id})과 다릅니다.`);
  return issues;
}

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
        "등록된 study 루트가 없습니다. 기존 기능은 그대로 쓸 수 있고, 공통 지식·통합 복습은 /study-init의 커리큘럼 승인 시 자동 등록된 뒤 사용할 수 있습니다.",
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
      continue;
    }
    issues.push(...(await projectManifestIssues(workspace.root, project)));
  }
  for (const report of await inspectRecovery(workspace.root)) {
    issues.push(
      `미완료 변경 계획 ${report.planId}: ${report.files.map((f) => `${f.path}=${f.state}`).join(", ")}${report.recoverable ? "" : " (외부 변경 있음)"}`,
    );
  }
  for (const check of extraChecks) issues.push(...(await check(workspace.root)));
  return { root: workspace.root, issues };
}

/**
 * Background health check at session start. Registration happens on
 * curriculum approval and recovery is offered in the /study-chapter menu, so
 * there is no user-facing workspace command; problems surface here instead.
 */
export async function workspaceHealthNotice(cwd: string, extraChecks: ExtraCheck[] = []): Promise<string | null> {
  const workspace = await findWorkspaceRoot(cwd);
  if (!workspace) return null;
  const { issues } = await checkWorkspace(workspace.root, extraChecks);
  if (!issues.length) return null;
  const pending = issues.filter((i) => i.startsWith("미완료 변경 계획")).length;
  return [
    `study 루트 점검: 문제 ${issues.length}건`,
    ...issues.slice(0, 3).map((i) => `- ${i}`),
    ...(issues.length > 3 ? [`- … 외 ${issues.length - 3}건`] : []),
    pending ? "중단된 저장은 /study-chapter 메뉴의 “중단된 저장 정리”로 마무리할 수 있습니다." : "",
  ]
    .filter(Boolean)
    .join("\n");
}
