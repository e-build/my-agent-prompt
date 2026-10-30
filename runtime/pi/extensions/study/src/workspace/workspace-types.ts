/** Portable study workspace contract stored at `.study/workspace.json`. */
export const WORKSPACE_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_MARKER = ".study/workspace.json";
export const DEFAULT_TIMEZONE = "Asia/Seoul";
export const DEFAULT_REVIEW_INTERVALS = [1, 3, 7, 14] as const;
export const COMMON_WRITE_ROOTS = [".study", "knowledge", "review"] as const;

export type WorkspaceProject = {
  /** Stable ID independent of the directory name. */
  id: string;
  slug: string;
  /** Root-relative POSIX path. */
  path: string;
};

export type WorkspaceManifest = {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  workspaceId: string;
  timezone: string;
  review: { intervals: number[] };
  projects: WorkspaceProject[];
};

export type Workspace = { root: string; manifest: WorkspaceManifest };

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isRelativeSafePath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 512) return false;
  if (value.startsWith("/") || value.includes("\\") || /^[a-zA-Z]:/.test(value)) return false;
  return value.split("/").every((part) => part && part !== "." && part !== "..");
}

const ID = /^[a-z][a-z0-9-]{2,63}$/;

export function validateWorkspaceManifest(value: unknown): WorkspaceManifest {
  if (!value || typeof value !== "object") throw new Error("workspace.json은 객체여야 합니다.");
  const manifest = value as Record<string, any>;
  if (manifest.schemaVersion !== WORKSPACE_SCHEMA_VERSION)
    throw new Error(`지원하지 않는 workspace schemaVersion입니다: ${manifest.schemaVersion}`);
  if (typeof manifest.workspaceId !== "string" || !ID.test(manifest.workspaceId))
    throw new Error("workspaceId가 올바르지 않습니다.");
  if (!isValidTimezone(manifest.timezone))
    throw new Error(`timezone이 올바르지 않습니다: ${manifest.timezone}`);
  const intervals = manifest.review?.intervals;
  if (
    !Array.isArray(intervals) ||
    !intervals.length ||
    intervals.some((n: unknown, i: number) => !Number.isInteger(n) || (n as number) < 1 || (i > 0 && (n as number) <= intervals[i - 1]))
  )
    throw new Error("review.intervals는 증가하는 양의 정수 목록이어야 합니다.");
  if (!Array.isArray(manifest.projects)) throw new Error("projects 목록이 필요합니다.");
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const project of manifest.projects) {
    if (!project || typeof project.id !== "string" || !ID.test(project.id))
      throw new Error(`project ID가 올바르지 않습니다: ${project?.id}`);
    if (typeof project.slug !== "string" || !project.slug)
      throw new Error(`project slug가 필요합니다: ${project.id}`);
    if (!isRelativeSafePath(project.path))
      throw new Error(`project path는 루트 기준 상대 경로여야 합니다: ${project.path}`);
    if (COMMON_WRITE_ROOTS.includes(project.path.split("/")[0] as any))
      throw new Error(`project path가 공통 영역과 겹칩니다: ${project.path}`);
    if (ids.has(project.id)) throw new Error(`중복 project ID입니다: ${project.id}`);
    if (paths.has(project.path)) throw new Error(`중복 project path입니다: ${project.path}`);
    ids.add(project.id);
    paths.add(project.path);
  }
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    workspaceId: manifest.workspaceId,
    timezone: manifest.timezone,
    review: { intervals: [...intervals] },
    projects: manifest.projects.map((p: WorkspaceProject) => ({ id: p.id, slug: p.slug, path: p.path })),
  };
}
