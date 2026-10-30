import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan } from "../workspace/change-plan.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import type { WorkspaceProject } from "../workspace/workspace-types.ts";
import type { KnowledgeRef } from "./knowledge-types.ts";
import { validateKnowledgeId, validateRef } from "./knowledge-validation.ts";

/**
 * `<project>/.study/bindings/<chapter>.json`: which shared propositions this
 * chapter teaches (regions), local application context, and the learner's
 * prerequisite route. Kept apart from inference chains on purpose.
 */
export type ChapterBinding = {
  schemaVersion: 1;
  projectId: string;
  chapterSlug: string;
  revision: number;
  regions: Array<{ regionId: string; refs: KnowledgeRef[] }>;
  contexts: Array<{ refId: string; note: string }>;
  prerequisites: Array<{ refId: string; goal: string; reason: string }>;
  uncertain: string[];
  updatedAt: string;
};

export type BindingUpdate = {
  /** null when the binding must not exist yet. */
  expectedRevision: number | null;
  regions: ChapterBinding["regions"];
  contexts?: ChapterBinding["contexts"];
  prerequisites?: ChapterBinding["prerequisites"];
  uncertain?: string[];
};

const CHAPTER = /^ch-\d+-[a-z0-9-]+$/;

export async function projectBySlug(root: string, projectSlug: string): Promise<WorkspaceProject> {
  const workspace = await readWorkspace(root);
  const project = workspace.manifest.projects.find((p) => p.slug === projectSlug || p.id === projectSlug);
  if (!project) throw new Error(`등록된 프로젝트가 아닙니다: ${projectSlug}`);
  return project;
}

export function bindingRelativePath(project: WorkspaceProject, chapterSlug: string): string {
  if (!CHAPTER.test(chapterSlug)) throw new Error(`챕터 slug가 올바르지 않습니다: ${chapterSlug}`);
  return `${project.path}/.study/bindings/${chapterSlug}.json`;
}

export async function loadBinding(
  root: string,
  projectSlug: string,
  chapterSlug: string,
): Promise<ChapterBinding | null> {
  const project = await projectBySlug(root, projectSlug);
  const path = bindingRelativePath(project, chapterSlug);
  const content = await readTextOptional(join(root, ...path.split("/")));
  if (content === null) return null;
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`챕터 지식 연결 파일이 손상됐습니다: ${path}`);
  }
}

function validateUpdate(update: BindingUpdate): Omit<ChapterBinding, "schemaVersion" | "projectId" | "chapterSlug" | "revision" | "updatedAt"> {
  if (!Array.isArray(update.regions)) throw new Error("regions 목록이 필요합니다.");
  const regionIds = new Set<string>();
  const regions = update.regions.map((region) => {
    if (!/^[a-z0-9-]{1,64}$/.test(region.regionId)) throw new Error(`regionId가 올바르지 않습니다: ${region.regionId}`);
    if (regionIds.has(region.regionId)) throw new Error(`중복 regionId입니다: ${region.regionId}`);
    regionIds.add(region.regionId);
    if (!Array.isArray(region.refs) || !region.refs.length) throw new Error(`영역에 지식이 필요합니다: ${region.regionId}`);
    return { regionId: region.regionId, refs: region.refs.map((ref) => validateRef(ref)) };
  });
  const contexts = (update.contexts ?? []).map((c) => ({ refId: validateKnowledgeId(c.refId), note: String(c.note ?? "").slice(0, 2000) }));
  const prerequisites = (update.prerequisites ?? []).map((p) => ({
    refId: validateKnowledgeId(p.refId),
    goal: String(p.goal ?? "").slice(0, 500),
    reason: String(p.reason ?? "").slice(0, 2000),
  }));
  const uncertain = (update.uncertain ?? []).map((u) => String(u).slice(0, 1000));
  return { regions, contexts, prerequisites, uncertain };
}

export async function updateBinding(
  root: string,
  projectSlug: string,
  chapterSlug: string,
  update: BindingUpdate,
  now = () => new Date().toISOString(),
): Promise<ChapterBinding> {
  const project = await projectBySlug(root, projectSlug);
  const path = bindingRelativePath(project, chapterSlug);
  const current = await loadBinding(root, projectSlug, chapterSlug);
  if ((current?.revision ?? null) !== update.expectedRevision)
    throw new Error(`다른 변경이 먼저 저장됐습니다. 챕터 지식 연결을 다시 읽으세요: ${path}`);
  const binding: ChapterBinding = {
    schemaVersion: 1,
    projectId: project.id,
    chapterSlug,
    revision: (current?.revision ?? 0) + 1,
    ...validateUpdate(update),
    updatedAt: now(),
  };
  const plan = await preparePlan(root, `binding-${project.id}-${chapterSlug}-${binding.revision}-${Date.now()}`, [
    { path, after: `${JSON.stringify(binding, null, 2)}\n` },
  ], { projectPaths: [project.path] });
  await executePlan(root, plan);
  return binding;
}
