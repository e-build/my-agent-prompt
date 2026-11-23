import { todayIn, reviewNext } from "./flow-actions.ts";
import { buildPhaseRequest } from "./phase-request.ts";
import { resolveStudyContext } from "../channel/channel-context.ts";
import { loadPrompt, type PromptLayers } from "../prompts/prompt-loader.ts";
import { findWorkspaceRoot } from "../review/workspace.ts";
import { loadProjectManifest } from "../state/project-manifest.ts";
import { loadStudyState, nextPhase, setPhase, type StudyPhase } from "../state/study-state.ts";
import { chapterTitle } from "../ui/chapter-catalog.ts";
import { parseStudyChapterArgs, resolveChapterSlug } from "../ui/chapter-target.ts";

/** `/study-init <topic>`: the init prompt, with root overrides when run inside a study root. */
export async function initMessage(cwd: string, topic: string, defaults: string): Promise<string> {
  if (!topic.trim()) throw new Error("사용법: /study-init <학습주제>");
  const workspace = await findWorkspaceRoot(cwd).catch(() => null);
  const loaded = await loadPrompt("init", { defaults, root: workspace?.root }, { topic: topic.trim() });
  return [...loaded.warnings.map((w) => `⚠️ ${w}`), loaded.text].join("\n\n");
}

export type ChapterTarget = { projectRoot: string; chapterSlug: string; phase: StudyPhase };

export async function resolveChapterTarget(cwd: string, args: string): Promise<ChapterTarget> {
  const context = await resolveStudyContext(cwd);
  const state = await loadStudyState(context.projectRoot);
  const { chapterArg, phaseArg } = parseStudyChapterArgs(args);
  const chapterSlug = resolveChapterSlug(state, chapterArg);
  return { projectRoot: context.projectRoot, chapterSlug, phase: phaseArg ?? nextPhase(state.chapters[chapterSlug]) };
}

/** `/study-chapter`: marks the phase started, then header + phase prompt. Review goes to the review prompt. */
export async function chapterMessage(target: ChapterTarget, defaults: string): Promise<string> {
  if (target.phase === "review") return reviewMessage(target.projectRoot, defaults, target.chapterSlug);
  const context = await resolveStudyContext(target.projectRoot);
  const layers: PromptLayers = { defaults, root: context.workspace?.root, project: context.projectRoot };
  const state = await loadStudyState(context.projectRoot);
  const current = state.chapters[target.chapterSlug][target.phase];
  if (current.status === "not_started" || current.status === "relearn_required")
    await setPhase(context.projectRoot, target.chapterSlug, target.phase, "in_progress", {
      ...(current.attempt !== undefined ? { attempt: current.attempt } : {}),
    });
  const manifest = await loadProjectManifest(context.projectRoot);
  const loaded = await loadPrompt(target.phase, layers);
  const extra =
    target.phase === "test" && current.attempt
      ? [`- 지난 attempt: ${current.attempt} (${current.score ?? "?"}/${current.maxScore ?? "?"})`]
      : [];
  const templates =
    target.phase === "concept" ? [await appendix("templates/concept-page", layers)] : [];
  return [
    buildPhaseRequest({
      projectRoot: context.projectRoot,
      chapterSlug: target.chapterSlug,
      chapterTitle: await chapterTitle(context.projectRoot, target.chapterSlug),
      phase: target.phase,
      status: current.status,
      channel: context.channelId,
      placement: manifest?.placement?.chapters?.[target.chapterSlug],
      extra,
      warnings: loaded.warnings,
      body: loaded.text,
    }),
    ...templates,
  ].join("\n\n");
}

async function appendix(name: "templates/concept-page" | "templates/chapter-readme", layers: PromptLayers) {
  const loaded = await loadPrompt(name, layers);
  return [`## 부록: ${name}`, "", "````md", loaded.text.trim(), "````"].join("\n");
}

/** `/study-review [chapter]`: today's due list followed by the review prompt. */
export async function reviewMessage(cwd: string, defaults: string, chapterSlug?: string): Promise<string> {
  const workspace = await findWorkspaceRoot(cwd);
  if (!workspace) throw new Error("등록된 study 루트가 없어 복습 일정을 볼 수 없습니다.");
  let projectRoot: string | undefined;
  let projectSlug: string | undefined;
  try {
    const context = await resolveStudyContext(cwd);
    projectRoot = context.projectRoot;
    projectSlug = chapterSlug ? context.projectSlug : undefined;
  } catch {
    projectRoot = undefined;
  }
  const today = todayIn(workspace.timezone);
  const list = await reviewNext(workspace.root, today, { projectSlug, chapterSlug });
  const loaded = await loadPrompt("review", { defaults, root: workspace.root, project: projectRoot });
  return [
    "# STUDY_REVIEW_REQUEST",
    "",
    `- studyRoot: ${workspace.root}`,
    `- channel: ${workspace.channel ?? "chat"}`,
    "",
    list.startsWith("##") ? list : `## 오늘 할 복습\n\n${list}`,
    ...loaded.warnings.map((w) => `\n⚠️ ${w}`),
    "",
    loaded.text.trim(),
  ].join("\n");
}
