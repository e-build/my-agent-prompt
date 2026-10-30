import { loadBinding, projectBySlug } from "../knowledge/chapter-bindings.ts";
import { resolveCanonical } from "../knowledge/knowledge-store.ts";
import { registerSchedules } from "./review-store.ts";

/**
 * First review registration for a completed chapter: every proposition bound
 * to the chapter gets one schedule from the completion day. Existing
 * schedules (from other chapters, completed or merged) are untouched.
 */
export async function registerChapterReviews(
  root: string,
  projectSlug: string,
  chapterSlug: string,
  completedOn: string,
): Promise<{ created: string[]; existing: string[] }> {
  const project = await projectBySlug(root, projectSlug);
  const binding = await loadBinding(root, projectSlug, chapterSlug);
  if (!binding || !binding.regions.length)
    throw new Error(`챕터 지식 연결이 없어 복습 일정을 만들지 않았습니다. 개념 학습에서 지식 연결 후 다시 등록하세요: ${chapterSlug}`);
  const ids: string[] = [];
  for (const region of binding.regions)
    for (const ref of region.refs) ids.push(await resolveCanonical(root, ref.id));
  return registerSchedules(root, {
    knowledgeIds: [...new Set(ids)],
    completedOn,
    origin: { projectId: project.id, chapterSlug },
  });
}
