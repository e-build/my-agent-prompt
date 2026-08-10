import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  loadStudyState,
  resolveNextPhase,
  resolveNextTarget,
  saveStudyState,
  type StudyPhase,
  type StudyState,
} from "./study-state.ts";

const PHASES = new Set<StudyPhase>(["diagnosis", "concept", "lab", "test", "review"]);

export type StudyChapterTarget = {
  projectRoot: string;
  chapterSlug: string;
  phase: StudyPhase;
  state: StudyState;
};

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function hasChapters(path: string): Promise<boolean> {
  try {
    return (await readdir(path, { withFileTypes: true })).some((entry) => entry.isDirectory() && /^ch-\d+-/.test(entry.name));
  } catch {
    return false;
  }
}

export async function findStudyProjectRoot(cwd: string): Promise<string> {
  let current = resolve(cwd);
  while (true) {
    if (basename(current).startsWith("study-") && await hasChapters(current)) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const entries = await readdir(cwd, { withFileTypes: true });
  const projects = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("study-")).map((entry) => join(cwd, entry.name));
  for (const project of projects) if (await hasChapters(project)) return project;
  throw new Error(`현재 경로에서 study-* 프로젝트를 찾지 못했습니다: ${cwd}`);
}

export function parseStudyChapterArgs(args: string): { chapterArg?: string; phaseArg?: StudyPhase } {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return {};
  if (PHASES.has(tokens[0] as StudyPhase)) return { phaseArg: tokens[0] as StudyPhase };
  const chapterArg = tokens[0];
  const phaseArg = tokens[1] as StudyPhase | undefined;
  if (phaseArg && !PHASES.has(phaseArg)) throw new Error(`단계는 diagnosis|concept|lab|test|review 중 하나여야 합니다: ${phaseArg}`);
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

export async function resolveStudyChapterTarget(cwd: string, args: string): Promise<StudyChapterTarget> {
  const projectRoot = await findStudyProjectRoot(cwd);
  const state = await loadStudyState(projectRoot);
  const { chapterArg, phaseArg } = parseStudyChapterArgs(args);
  const chapterSlug = resolveChapterSlug(state, chapterArg);
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

async function phaseInstructions(phase: StudyPhase): Promise<string> {
  try {
    return (await readFile(join(dirname(fileURLToPath(import.meta.url)), "instructions", `${phase}.md`), "utf8")).trim();
  } catch {
    return "현재 phase의 표준 학습 흐름을 진행하세요.";
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
    return [...common, "브라우저 assessment가 열려 있고 답안 제출을 기다리는 중입니다. 새 assessment를 만들지 말고 제출을 기다리세요."].join("\n");
  }
  if (phaseState.status === "awaiting_grade") {
    return [...common, "답안은 제출됐고 채점을 기다리는 중입니다. 새 assessment나 다음 phase를 시작하지 마세요."].join("\n");
  }
  if (phaseState.status === "awaiting_review") {
    return [...common, "채점 결과가 브라우저에 표시됐습니다. 학습자가 결과 확인 버튼을 누를 때까지 다음 phase로 넘어가지 마세요."].join("\n");
  }
  return [...common, await phaseInstructions(target.phase)].join("\n");
}

export function registerStudyChapterCommand(
  pi: ExtensionAPI,
  onTarget?: (target: StudyChapterTarget) => void,
): void {
  pi.registerCommand("study-chapter", {
    description: "챕터 상태를 확인하고 안 한 단계부터 이어서 진행",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("현재 agent 응답이 끝난 뒤 다시 실행하세요.", "warning");
        return;
      }
      try {
        const target = await resolveStudyChapterTarget(ctx.cwd, args);
        onTarget?.(target);
        const title = await chapterTitle(target.projectRoot, target.chapterSlug);
        pi.sendUserMessage(await phasePrompt(target, title));
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
