import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan } from "../workspace/change-plan.ts";
import { bindingRelativePath, loadBinding, projectBySlug } from "./chapter-bindings.ts";
import { loadItem, resolveCanonical } from "./knowledge-store.ts";
import type { KnowledgeItem } from "./knowledge-types.ts";
import { insertRegionsAfterHeading, planRegionRefresh, renderRegion } from "./textbook-regions.ts";

export type TextbookRefreshResult = {
  path: string;
  applied: boolean;
  updated: string[];
  inserted: string[];
  deferred: Array<{ regionId: string; current: string; proposed: string }>;
  blocked: Array<{ regionId: string; reason: string }>;
  missing: string[];
};

/**
 * Bring the chapter README's managed regions up to the latest canonical
 * knowledge. Text outside regions and user-edited regions are never touched.
 */
export async function refreshTextbook(
  root: string,
  projectSlug: string,
  chapterSlug: string,
  options: { apply: boolean; regionIds?: string[]; insertMissingAfterHeading?: string },
): Promise<TextbookRefreshResult> {
  const project = await projectBySlug(root, projectSlug);
  bindingRelativePath(project, chapterSlug);
  const binding = await loadBinding(root, projectSlug, chapterSlug);
  if (!binding) throw new Error(`챕터 지식 연결이 없습니다: ${projectSlug}/${chapterSlug}`);
  const relative = `${project.path}/${chapterSlug}/README.md`;
  const content = await readTextOptional(join(root, ...relative.split("/")));
  if (content === null) throw new Error(`챕터 교재가 없습니다: ${relative}`);

  const desired = new Map<string, KnowledgeItem[]>();
  for (const region of binding.regions) {
    if (options.regionIds?.length && !options.regionIds.includes(region.regionId)) continue;
    const items: KnowledgeItem[] = [];
    for (const ref of region.refs) {
      const canonical = await resolveCanonical(root, ref.id);
      const item = await loadItem(root, canonical);
      if (item && !items.some((existing) => existing.id === item.id)) items.push(item);
    }
    desired.set(region.regionId, items);
  }
  const plan = planRegionRefresh(content, desired);
  let next = plan.content;
  const inserted: string[] = [];
  if (plan.missing.length && options.insertMissingAfterHeading) {
    const rendered: string[] = [];
    for (const regionId of plan.missing) {
      try {
        rendered.push(renderRegion(regionId, desired.get(regionId)!));
        inserted.push(regionId);
      } catch (error) {
        plan.blocked.push({ regionId, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    if (rendered.length) next = insertRegionsAfterHeading(next, options.insertMissingAfterHeading, rendered);
  }
  const changed = next !== content;
  if (options.apply && changed) {
    const prepared = await preparePlan(root, `textbook-${project.id}-${chapterSlug}-${Date.now()}`, [{ path: relative, after: next }], {
      projectPaths: [project.path],
    });
    await executePlan(root, prepared);
  }
  return {
    path: relative,
    applied: options.apply && changed,
    updated: plan.updated,
    inserted,
    deferred: plan.deferred,
    blocked: plan.blocked,
    missing: plan.missing.filter((id) => !inserted.includes(id)),
  };
}
