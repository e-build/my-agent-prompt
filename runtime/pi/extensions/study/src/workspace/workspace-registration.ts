import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readTextOptional } from "./atomic-file.ts";
import { executePlan, preparePlan, type ChangePlan, type PlannedChange } from "./change-plan.ts";
import { findWorkspaceRoot } from "./workspace-root.ts";
import {
  DEFAULT_REVIEW_INTERVALS,
  DEFAULT_TIMEZONE,
  WORKSPACE_MARKER,
  WORKSPACE_SCHEMA_VERSION,
  type WorkspaceManifest,
  type WorkspaceProject,
} from "./workspace-types.ts";

const LOCAL_IGNORE = ".study/local/";

export type RegistrationPreview = {
  root: string;
  manifest: WorkspaceManifest;
  projects: WorkspaceProject[];
  /** null when the root is already fully registered. */
  plan: ChangePlan | null;
  summary: string;
};

function shortId(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function discoverProjects(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^study-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) continue;
    const dir = join(root, entry.name);
    const children = await readdir(dir, { withFileTypes: true });
    const hasChapter = children.some((c) => c.isDirectory() && /^ch-\d+-/.test(c.name));
    const hasManifest = (await readTextOptional(join(dir, ".study", "project.json"))) !== null;
    if (hasChapter || hasManifest) result.push(entry.name);
  }
  return result.sort();
}

function parseProjectManifest(path: string, content: string): Record<string, unknown> {
  try {
    const value = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return value;
  } catch {
    throw new Error(`project.json이 손상됐습니다. 자동으로 다시 만들지 않습니다: ${path}`);
  }
}

/**
 * Read-only registration preview. Existing workspace/project IDs are reused;
 * only missing IDs, the root marker and the local gitignore entry are added.
 */
export async function previewWorkspaceRegistration(
  rootInput: string,
  options: { onlyProjects?: string[] } = {},
): Promise<RegistrationPreview> {
  const root = resolve(rootInput);
  const existingWorkspace = await findWorkspaceRoot(root);
  if (existingWorkspace && existingWorkspace.root !== root)
    throw new Error(`이미 상위 study 루트에 포함돼 있습니다: ${existingWorkspace.root}`);
  const existing = existingWorkspace?.manifest;
  const projects: WorkspaceProject[] = [...(existing?.projects ?? [])];
  const changes: PlannedChange[] = [];

  const discovered = await discoverProjects(root);
  const targets = options.onlyProjects
    ? [...new Set([...projects.map((p) => p.path), ...options.onlyProjects])].filter((slug) => discovered.includes(slug) || projects.some((p) => p.path === slug))
    : discovered;
  for (const slug of targets) {
    const path = join(root, slug, ".study", "project.json");
    const content = await readTextOptional(path);
    const current = content === null ? null : parseProjectManifest(path, content);
    let project = projects.find((p) => p.path === slug);
    const storedId = typeof current?.projectId === "string" ? current.projectId : undefined;
    if (!project) {
      project = { id: storedId ?? shortId("p"), slug, path: slug };
      projects.push(project);
    }
    if (storedId && storedId !== project.id)
      throw new Error(`project.json의 projectId가 workspace 등록과 다릅니다: ${slug}`);
    if (current === null) {
      changes.push({
        path: `${slug}/.study/project.json`,
        after: `${JSON.stringify({ version: 1, projectId: project.id, projectSlug: slug, topic: slug, chapters: {} }, null, 2)}\n`,
      });
    } else if (!storedId) {
      changes.push({
        path: `${slug}/.study/project.json`,
        after: `${JSON.stringify({ ...current, projectId: project.id }, null, 2)}\n`,
      });
    }
  }

  const manifest: WorkspaceManifest = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    workspaceId: existing?.workspaceId ?? shortId("ws"),
    timezone: existing?.timezone ?? DEFAULT_TIMEZONE,
    review: { intervals: existing?.review.intervals ?? [...DEFAULT_REVIEW_INTERVALS] },
    projects,
  };
  const markerContent = `${JSON.stringify(manifest, null, 2)}\n`;
  if ((await readTextOptional(join(root, WORKSPACE_MARKER))) !== markerContent)
    changes.push({ path: WORKSPACE_MARKER, after: markerContent });

  const gitignore = await readTextOptional(join(root, ".gitignore"));
  const ignoreLines = (gitignore ?? "").split("\n").map((line) => line.trim());
  if (!ignoreLines.includes(LOCAL_IGNORE) && !ignoreLines.includes(".study/local")) {
    const base = gitignore ?? "";
    changes.push({
      path: ".gitignore",
      after: `${base}${base && !base.endsWith("\n") ? "\n" : ""}${LOCAL_IGNORE}\n`,
    });
  }

  const projectPaths = projects.map((p) => p.path);
  const plan = changes.length
    ? await preparePlan(root, `register-${randomUUID()}`, changes, {
        projectPaths,
        rootFiles: [".gitignore"],
      })
    : null;
  const summary = [
    `study 루트 등록: ${root}`,
    `- 시간대: ${manifest.timezone}, 복습 간격: +${manifest.review.intervals.join("/+")}일`,
    `- 프로젝트: ${projects.map((p) => `${p.slug}(${p.id})`).join(", ") || "없음"}`,
    `- 변경 파일: ${changes.map((c) => c.path).join(", ") || "없음"}`,
  ].join("\n");
  return { root, manifest, projects, plan, summary };
}

/** Apply exactly the previewed changes; any concurrent change aborts the whole plan. */
export async function applyWorkspaceRegistration(
  rootInput: string,
  preview: RegistrationPreview,
): Promise<{ status: "committed" | "unchanged" | "already_applied" }> {
  const root = resolve(rootInput);
  if (root !== preview.root) throw new Error("미리 보기와 다른 루트입니다.");
  if (!preview.plan) return { status: "unchanged" };
  return { status: (await executePlan(root, preview.plan)).status };
}
