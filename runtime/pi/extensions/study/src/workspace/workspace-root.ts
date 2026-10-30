import { readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  WORKSPACE_MARKER,
  validateWorkspaceManifest,
  type Workspace,
  type WorkspaceProject,
} from "./workspace-types.ts";

async function markerExists(root: string): Promise<boolean> {
  try {
    return (await stat(join(root, WORKSPACE_MARKER))).isFile();
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
}

/** Read and validate a registered root. Never creates or repairs files. */
export async function readWorkspace(root: string): Promise<Workspace> {
  const absolute = resolve(root);
  const path = join(absolute, WORKSPACE_MARKER);
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(`등록된 study 루트가 아닙니다: ${absolute}`);
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`workspace.json이 손상됐습니다. 자동 복구하지 않습니다: ${path}`);
  }
  return { root: absolute, manifest: validateWorkspaceManifest(parsed) };
}

/**
 * Find the registered study root: explicit root first, otherwise the nearest
 * ancestor marker. Returns null when nothing is registered. Read-only.
 */
export async function findWorkspaceRoot(
  cwd: string,
  explicitRoot?: string,
): Promise<Workspace | null> {
  if (explicitRoot !== undefined) {
    if (!explicitRoot.trim()) throw new Error("workspaceRoot는 빈 경로일 수 없습니다.");
    const root = resolve(cwd, explicitRoot);
    if (!(await markerExists(root))) throw new Error(`등록된 study 루트가 아닙니다: ${root}`);
    await assertNotNested(root);
    return readWorkspace(root);
  }
  let current = resolve(cwd);
  while (true) {
    if (await markerExists(current)) {
      await assertNotNested(current);
      return readWorkspace(current);
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function assertNotNested(root: string): Promise<void> {
  let current = dirname(root);
  while (true) {
    if (await markerExists(current))
      throw new Error(`study 루트가 중첩돼 있습니다. 하나만 남겨야 합니다: ${current} ⊃ ${root}`);
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

export async function requireWorkspace(cwd: string, explicitRoot?: string): Promise<Workspace> {
  const workspace = await findWorkspaceRoot(cwd, explicitRoot);
  if (!workspace)
    throw new Error(
      "등록된 study 루트를 찾지 못했습니다. /study-init으로 만든 프로젝트는 커리큘럼을 승인하면 자동 등록됩니다.",
    );
  return workspace;
}

/** Registered project containing an absolute path, if any. */
export function projectForPath(workspace: Workspace, absolutePath: string): WorkspaceProject | null {
  const local = relative(workspace.root, resolve(absolutePath)).split(sep).join("/");
  if (!local || local.startsWith("..")) return null;
  return (
    workspace.manifest.projects.find(
      (project) => local === project.path || local.startsWith(`${project.path}/`),
    ) ?? null
  );
}

export function projectRootOf(workspace: Workspace, project: WorkspaceProject): string {
  return join(workspace.root, ...project.path.split("/"));
}
