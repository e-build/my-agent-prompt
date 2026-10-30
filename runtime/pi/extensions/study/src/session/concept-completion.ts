import { join } from "node:path";
import { loadBinding, projectBySlug } from "../knowledge/chapter-bindings.ts";
import { refreshTextbook } from "../knowledge/textbook-refresh.ts";
import { executePlan, preparePlan } from "../workspace/change-plan.ts";
import { loadStudyState, updatePhaseState } from "./study-state.ts";

export type ConceptCompletion = { summary: string; regionIds?: string[]; uncertain?: string[] };

/**
 * Concept learning ends only when the chapter is linked to shared knowledge,
 * every managed region is present and up to date in README, and the phase is
 * saved. A save failure is reported, never treated as completion.
 */
export async function finishConcept(
  root: string,
  projectSlug: string,
  chapterSlug: string,
  completion: ConceptCompletion,
): Promise<{ message: string; uncertain: string[] }> {
  if (typeof completion?.summary !== "string" || !completion.summary.trim())
    throw new Error("summary(이번 개념 학습 요약)가 필요합니다.");
  const project = await projectBySlug(root, projectSlug);
  const binding = await loadBinding(root, projectSlug, chapterSlug);
  if (!binding || !binding.regions.length)
    throw new Error("챕터 지식 연결이 없습니다. study_textbook_refresh의 bindingJson으로 먼저 연결하세요.");
  const check = await refreshTextbook(root, projectSlug, chapterSlug, { apply: false, regionIds: completion.regionIds });
  if (check.missing.length) throw new Error(`교재에 아직 없는 관리 영역이 있습니다: ${check.missing.join(", ")}`);
  if (check.deferred.length)
    throw new Error(`사용자가 직접 고친 교재 영역의 보류를 먼저 정리하세요: ${check.deferred.map((d) => d.regionId).join(", ")}`);
  if (check.blocked.length) throw new Error(`교재에 쓸 수 없는 지식이 있습니다: ${check.blocked.map((b) => b.reason).join("; ")}`);
  if (check.updated.length)
    throw new Error(`교재 영역이 최신이 아닙니다. study_textbook_refresh로 먼저 갱신하세요: ${check.updated.join(", ")}`);
  const uncertain = [...binding.uncertain, ...(completion.uncertain ?? [])].map((u) => String(u).slice(0, 1000));
  const projectRoot = join(root, ...project.path.split("/"));
  const state = await loadStudyState(projectRoot);
  updatePhaseState(state, chapterSlug, "concept", {
    status: "completed",
    evidence: [`${chapterSlug}/README.md`, `.study/bindings/${chapterSlug}.json`],
    reason: `${completion.summary.slice(0, 500)}${uncertain.length ? ` / 미확인: ${uncertain.join("; ")}` : ""}`,
  });
  const plan = await preparePlan(root, `concept-finish-${project.id}-${chapterSlug}-${Date.now()}`, [
    { path: `${project.path}/.study/state.json`, after: `${JSON.stringify(state, null, 2)}\n` },
  ], { projectPaths: [project.path] });
  await executePlan(root, plan);
  return {
    message: `개념 학습 완료 저장. 다음: 프로젝트 실습(/study-chapter ${chapterSlug} lab).${uncertain.length ? ` 미확인 ${uncertain.length}건은 이해 완료로 처리하지 않았습니다.` : ""}`,
    uncertain,
  };
}
