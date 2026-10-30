import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findStudyProjectRoot } from "../project/project-root.ts";
export { findStudyProjectRoot } from "../project/project-root.ts";
import { loadPhaseInstructions } from "./phase-instructions.ts";
import { buildDialogueStatus } from "./dialogue-prompt.ts";
import {
  buildChapterMenu,
  chapterArgumentCompletions,
  chapterDescription,
  parsePhase,
  PHASE_KO,
  PHASE_ORDER,
  phaseLabel,
  readChapterCatalog,
  type MenuAction,
} from "./chapter-catalog.ts";
import { currentRun, loadDialogue } from "./dialogue-store.ts";
import { findWorkspaceRoot, projectForPath } from "../workspace/workspace-root.ts";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  loadStudyState,
  resolveNextPhase,
  resolveNextTarget,
  saveStudyState,
  type StudyPhase,
  type StudyState,
} from "./study-state.ts";


export type StudyChapterTarget = {
  projectRoot: string;
  chapterSlug: string;
  phase: StudyPhase;
  state: StudyState;
};

export function parseStudyChapterArgs(args: string): {
  chapterArg?: string;
  phaseArg?: StudyPhase;
} {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return {};
  const first = parsePhase(tokens[0]);
  if (first) return { phaseArg: first };
  const chapterArg = tokens[0];
  if (!tokens[1]) return { chapterArg, phaseArg: undefined };
  const phaseArg = parsePhase(tokens[1]);
  if (!phaseArg)
    throw new Error(`단계는 진단|개념|실습|시험|복습 중 하나여야 합니다(영문도 가능): ${tokens[1]}`);
  return { chapterArg, phaseArg };
}

export function resolveChapterSlug(state: StudyState, chapterArg?: string): string {
  if (!chapterArg) {
    const target = resolveNextTarget(state);
    if (!target) throw new Error("학습 챕터가 없습니다.");
    return target.chapterSlug;
  }
  if (state.chapters[chapterArg]) return chapterArg;
  const normalizedNumber = chapterArg.match(/^\d+$/)?.[0]?.padStart(2, "0");
  const candidates = Object.keys(state.chapters).filter((slug) =>
    normalizedNumber ? slug.startsWith(`ch-${normalizedNumber}-`) : slug.includes(chapterArg),
  );
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) throw new Error(`챕터를 찾지 못했습니다: ${chapterArg}`);
  throw new Error(`챕터가 여러 개 일치합니다: ${candidates.join(", ")}`);
}

export async function resolveStudyChapterTarget(
  cwd: string,
  args: string,
): Promise<StudyChapterTarget> {
  const projectRoot = await findStudyProjectRoot(cwd);
  const state = await loadStudyState(projectRoot);
  const { chapterArg, phaseArg } = parseStudyChapterArgs(args);
  const chapterSlug = resolveChapterSlug(state, chapterArg ?? (phaseArg ? state.activeChapter : undefined));
  const phase = phaseArg ?? resolveNextPhase(state.chapters[chapterSlug]);
  state.activeChapter = chapterSlug;
  state.activePhase = phase;
  await saveStudyState(projectRoot, state);
  return { projectRoot, chapterSlug, phase, state };
}

async function chapterTitle(projectRoot: string, chapterSlug: string): Promise<string> {
  try {
    const content = await readFile(join(projectRoot, chapterSlug, "README.md"), "utf8");
    return content.match(/^#\s+(?:Ch\s*\d+\s*[—-]\s*)?(.+)$/m)?.[1]?.trim() || chapterSlug;
  } catch {
    return chapterSlug;
  }
}

async function phasePrompt(target: StudyChapterTarget, title: string): Promise<string> {
  const phaseState = target.state.chapters[target.chapterSlug][target.phase];
  const common = [
    "# STUDY_CHAPTER_PHASE_REQUEST",
    "",
    `- projectRoot: ${target.projectRoot}`,
    `- chapterSlug: ${target.chapterSlug}`,
    `- chapterTitle: ${title}`,
    `- phase: ${target.phase}`,
    `- currentStatus: ${phaseState.status}`,
    "",
  ];
  if (phaseState.status === "awaiting_submission") {
    return [
      ...common,
      "브라우저 assessment가 열려 있고 답안 제출을 기다리는 중입니다. 새 assessment를 만들지 말고 제출을 기다리세요.",
    ].join("\n");
  }
  if (phaseState.status === "awaiting_grade") {
    return [
      ...common,
      "답안은 제출됐고 채점을 기다리는 중입니다. 새 assessment나 다음 phase를 시작하지 마세요.",
    ].join("\n");
  }
  if (phaseState.status === "awaiting_review") {
    return [
      ...common,
      "채점 결과가 브라우저에 표시됐습니다. 학습자가 결과 확인 버튼을 누를 때까지 다음 phase로 넘어가지 마세요.",
    ].join("\n");
  }
  const sections = [...common, await loadPhaseInstructions(target.phase)];
  if (target.phase === "diagnosis") sections.push("", await diagnosisStatus(target));
  return sections.join("\n");
}

/** Read-only resume context for conversational diagnosis. */
export async function diagnosisStatus(target: Pick<StudyChapterTarget, "projectRoot" | "chapterSlug">): Promise<string> {
  const workspace = await findWorkspaceRoot(target.projectRoot);
  const project = workspace ? projectForPath(workspace, target.projectRoot) : null;
  if (!workspace || !project) return buildDialogueStatus({ registered: false });
  const dialogue = await loadDialogue(workspace.root, project.slug, target.chapterSlug);
  return buildDialogueStatus({ registered: true, projectSlug: project.slug, run: currentRun(dialogue) });
}

type ChapterUi = Pick<ExtensionCommandContext, "cwd" | "hasUI" | "isIdle"> & {
  ui: Pick<ExtensionCommandContext["ui"], "notify" | "select">;
};

/** A legacy HTML diagnosis waiting on a browser session that no longer exists. */
function staleDiagnosis(status: string | undefined, hasLiveSession: boolean): boolean {
  return !hasLiveSession && (status === "awaiting_submission" || status === "awaiting_grade" || status === "awaiting_review");
}

export type ChapterCommandHooks = {
  onTarget?: (target: StudyChapterTarget) => void;
  /** Live browser assessment sessions for this Pi session (legacy diagnosis). */
  hasLiveDiagnosis?: (chapterSlug: string) => boolean;
  /** Integrated-review actions; absent when the project is not in a registered root. */
  startReview?: (projectRoot: string, chapterSlug: string) => Promise<string>;
  restartDiagnosis?: (projectRoot: string, chapterSlug: string) => Promise<void>;
  isRegistered?: (projectRoot: string) => Promise<boolean>;
  /** Interrupted multi-file saves waiting in the study root. */
  pendingSaves?: (projectRoot: string) => Promise<number>;
  recoverSaves?: (projectRoot: string) => Promise<string>;
};

/**
 * Without arguments the command shows a short menu. Arguments still work for
 * fast typing and accept Korean phase names; completion lists both.
 */
export async function runStudyChapter(
  pi: Pick<ExtensionAPI, "sendUserMessage">,
  args: string,
  ctx: ChapterUi,
  hooks: ChapterCommandHooks = {},
): Promise<void> {
  if (args.trim() || !ctx.hasUI) {
    await openTarget(pi, await resolveStudyChapterTarget(ctx.cwd, args), hooks);
    return;
  }
  const projectRoot = await findStudyProjectRoot(ctx.cwd);
  const catalog = await readChapterCatalog(projectRoot);
  if (!catalog.chapters.length) throw new Error("학습 챕터가 없습니다.");
  const registered = (await hooks.isRegistered?.(projectRoot)) ?? false;
  const pendingSaves = registered ? ((await hooks.pendingSaves?.(projectRoot)) ?? 0) : 0;
  const menu = buildChapterMenu(catalog, {
    pendingSaves,
    registered: registered && !!hooks.startReview,
    staleDiagnosis: (slug) =>
      !!hooks.restartDiagnosis &&
      registered &&
      staleDiagnosis(catalog.chapters.find((c) => c.slug === slug)?.phases.diagnosis, hooks.hasLiveDiagnosis?.(slug) ?? false),
  });
  const choice = await ctx.ui.select("무엇을 할까요?", menu.map((m) => m.label));
  const picked = menu.find((m) => m.label === choice)?.action;
  if (!picked) return;
  await runMenuAction(pi, picked, ctx, projectRoot, catalog, hooks);
}

async function runMenuAction(
  pi: Pick<ExtensionAPI, "sendUserMessage">,
  action: MenuAction,
  ctx: ChapterUi,
  projectRoot: string,
  catalog: Awaited<ReturnType<typeof readChapterCatalog>>,
  hooks: ChapterCommandHooks,
): Promise<void> {
  if (action.type === "open") {
    await openTarget(pi, await resolveStudyChapterTarget(projectRoot, `${action.chapterSlug} ${action.phase}`), hooks);
    return;
  }
  if (action.type === "pick-chapter") {
    const labels = catalog.chapters.map((c) => `${c.number}  ${c.title} — ${chapterDescription(c)}`);
    const choice = await ctx.ui.select("챕터를 고르세요", labels);
    const chapter = catalog.chapters[labels.indexOf(choice ?? "")];
    if (!chapter) return;
    await runMenuAction(pi, { type: "pick-phase", chapterSlug: chapter.slug }, ctx, projectRoot, catalog, hooks);
    return;
  }
  if (action.type === "pick-phase") {
    const chapter = catalog.chapters.find((c) => c.slug === action.chapterSlug)!;
    const order = [chapter.next, ...PHASE_ORDER.filter((p) => p !== chapter.next)];
    const labels = order.map((p) => `${PHASE_KO[p]} — ${phaseLabel(p)}${p === chapter.next ? " (다음 단계)" : ""}`);
    const choice = await ctx.ui.select(`${chapter.number} ${chapter.title}: 단계를 고르세요`, labels);
    const phase = order[labels.indexOf(choice ?? "")];
    if (!phase) return;
    await openTarget(pi, await resolveStudyChapterTarget(projectRoot, `${chapter.slug} ${phase}`), hooks);
    return;
  }
  if (action.type === "recover-saves") {
    ctx.ui.notify(await hooks.recoverSaves!(projectRoot), "info");
    return;
  }
  if (action.type === "start-review") {
    ctx.ui.notify(await hooks.startReview!(projectRoot, action.chapterSlug), "info");
    return;
  }
  await hooks.restartDiagnosis!(projectRoot, action.chapterSlug);
  await openTarget(pi, await resolveStudyChapterTarget(projectRoot, `${action.chapterSlug} diagnosis`), hooks);
}

async function openTarget(
  pi: Pick<ExtensionAPI, "sendUserMessage">,
  target: StudyChapterTarget,
  hooks: ChapterCommandHooks,
): Promise<void> {
  hooks.onTarget?.(target);
  const title = await chapterTitle(target.projectRoot, target.chapterSlug);
  pi.sendUserMessage(await phasePrompt(target, title));
}

export function registerStudyChapterCommand(
  pi: ExtensionAPI,
  hooksOrOnTarget?: ChapterCommandHooks | ((target: StudyChapterTarget) => void),
): void {
  const hooks: ChapterCommandHooks =
    typeof hooksOrOnTarget === "function" ? { onTarget: hooksOrOnTarget } : (hooksOrOnTarget ?? {});
  let completionCwd = process.cwd();
  pi.registerCommand("study-chapter", {
    description: "학습 이어가기 — 인자 없이 실행하면 메뉴, 예: /study-chapter 01 개념",
    getArgumentCompletions: async (prefix: string) => {
      try {
        return chapterArgumentCompletions(await readChapterCatalog(await findStudyProjectRoot(completionCwd)), prefix);
      } catch {
        return null;
      }
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      completionCwd = ctx.cwd;
      if (!ctx.isIdle()) {
        ctx.ui.notify("현재 agent 응답이 끝난 뒤 다시 실행하세요.", "warning");
        return;
      }
      try {
        await runStudyChapter(pi, args, ctx, hooks);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
  // Completion runs before any handler; remember the session cwd when available.
  pi.on?.("session_start", (_event, ctx) => {
    if (ctx?.cwd) completionCwd = ctx.cwd;
  });
}
