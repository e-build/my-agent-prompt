import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { projectBySlug } from "../knowledge/chapter-bindings.ts";
import type { PrepareOptions, QuestionInput } from "../evidence/question-store.ts";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan, type PlannedChange } from "../workspace/change-plan.ts";
import type { WorkspaceProject } from "../workspace/workspace-types.ts";
import {
  createDiagnosis,
  finishDiagnosis,
  prepareDiagnosisQuestion,
  validateRun,
  type DiagnosisEndReason,
  type DiagnosisRun,
  type LearningRoute,
} from "./dialogue-state.ts";
import { loadStudyState, updatePhaseState, type StudyPhase, type StudyPhaseStatus } from "./study-state.ts";

/** `<project>/.study/dialogue/<chapter>.json`: every diagnosis attempt for a chapter. */
export type ChapterDialogue = {
  schemaVersion: 1;
  projectId: string;
  chapterSlug: string;
  runs: DiagnosisRun[];
};

const CHAPTER = /^ch-\d+-[a-z0-9-]+$/;

function dialoguePath(project: WorkspaceProject, chapterSlug: string): string {
  if (!CHAPTER.test(chapterSlug)) throw new Error(`챕터 slug가 올바르지 않습니다: ${chapterSlug}`);
  return `${project.path}/.study/dialogue/${chapterSlug}.json`;
}

export async function loadDialogue(root: string, projectSlug: string, chapterSlug: string): Promise<ChapterDialogue | null> {
  const project = await projectBySlug(root, projectSlug);
  const relative = dialoguePath(project, chapterSlug);
  const content = await readTextOptional(join(root, ...relative.split("/")));
  if (content === null) return null;
  let dialogue: ChapterDialogue;
  try {
    dialogue = JSON.parse(content);
  } catch {
    throw new Error(`대화 진단 기록이 손상됐습니다: ${relative}`);
  }
  if (!Array.isArray(dialogue.runs)) throw new Error(`대화 진단 기록 형식이 올바르지 않습니다: ${relative}`);
  dialogue.runs.forEach(validateRun);
  return dialogue;
}

export function currentRun(dialogue: ChapterDialogue | null): DiagnosisRun | null {
  return dialogue?.runs.at(-1) ?? null;
}

/** Planned change for the project's state.json phase entry (no direct write). */
async function phaseChange(
  root: string,
  project: WorkspaceProject,
  chapterSlug: string,
  phase: StudyPhase,
  status: StudyPhaseStatus,
  patch: { evidence?: string[]; reason?: string } = {},
): Promise<PlannedChange> {
  const projectRoot = join(root, ...project.path.split("/"));
  const state = await loadStudyState(projectRoot);
  updatePhaseState(state, chapterSlug, phase, { status, ...patch });
  return { path: `${project.path}/.study/state.json`, after: `${JSON.stringify(state, null, 2)}\n` };
}

function encode(dialogue: ChapterDialogue): string {
  return `${JSON.stringify(dialogue, null, 2)}\n`;
}

/**
 * Hooks for study_question_prepare: diagnosis questions are counted against
 * the open attempt in the same atomic change as the question itself.
 */
export async function diagnosisPrepareOptions(root: string, input: QuestionInput): Promise<PrepareOptions> {
  if (input?.purpose !== "diagnosis") return {};
  const { projectSlug, chapterSlug } = input.context ?? {};
  if (!projectSlug || !chapterSlug) return {};
  const project = await projectBySlug(root, projectSlug);
  let next: ChapterDialogue | null = null;
  let started = false;
  return {
    beforeCreate: async (question) => {
      const dialogue = (await loadDialogue(root, projectSlug, chapterSlug)) ?? {
        schemaVersion: 1 as const,
        projectId: project.id,
        chapterSlug,
        runs: [],
      };
      let run = currentRun(dialogue);
      if (!run) {
        run = createDiagnosis({ id: `diag-${randomUUID()}`, chapterSlug, at: new Date().toISOString() });
        started = true;
      }
      const updated = prepareDiagnosisQuestion(run, question.id);
      next = { ...dialogue, runs: started ? [...dialogue.runs, updated] : [...dialogue.runs.slice(0, -1), updated] };
    },
    extraChanges: async () => {
      if (!next) return [];
      const changes: PlannedChange[] = [{ path: dialoguePath(project, chapterSlug), after: encode(next) }];
      if (started) changes.push(await phaseChange(root, project, chapterSlug, "diagnosis", "in_progress"));
      return changes;
    },
  };
}

export async function finishDiagnosisRun(
  root: string,
  projectSlug: string,
  chapterSlug: string,
  args: { reason: DiagnosisEndReason; route?: LearningRoute; unverified: string[] },
  now = () => new Date().toISOString(),
): Promise<DiagnosisRun> {
  const project = await projectBySlug(root, projectSlug);
  const dialogue = await loadDialogue(root, projectSlug, chapterSlug);
  const run = currentRun(dialogue);
  if (!dialogue || !run) throw new Error("진행 중인 대화형 진단이 없습니다.");
  const finished = finishDiagnosis(run, { ...args, at: now() });
  const path = dialoguePath(project, chapterSlug);
  const changes: PlannedChange[] = [
    { path, after: encode({ ...dialogue, runs: [...dialogue.runs.slice(0, -1), finished] }) },
    await phaseChange(root, project, chapterSlug, "diagnosis", "completed", {
      evidence: [`.study/dialogue/${chapterSlug}.json`],
      reason: `대화형 진단 종료: ${finished.endReason}${finished.unverified.length ? `, 미확인 ${finished.unverified.length}건` : ""}`,
    }),
  ];
  const plan = await preparePlan(root, `diagnosis-finish-${finished.id}`, changes, { projectPaths: [project.path] });
  await executePlan(root, plan);
  return finished;
}

/** Explicitly start a new attempt after the previous one finished. */
export async function startDiagnosisAttempt(root: string, projectSlug: string, chapterSlug: string): Promise<DiagnosisRun> {
  const project = await projectBySlug(root, projectSlug);
  const dialogue = (await loadDialogue(root, projectSlug, chapterSlug)) ?? {
    schemaVersion: 1 as const,
    projectId: project.id,
    chapterSlug,
    runs: [],
  };
  if (currentRun(dialogue)?.status === "open") throw new Error("진행 중인 진단이 있습니다. 먼저 종료하세요.");
  const run = createDiagnosis({ id: `diag-${randomUUID()}`, chapterSlug, at: new Date().toISOString() });
  const plan = await preparePlan(root, `diagnosis-start-${run.id}`, [
    { path: dialoguePath(project, chapterSlug), after: encode({ ...dialogue, runs: [...dialogue.runs, run] }) },
    await phaseChange(root, project, chapterSlug, "diagnosis", "in_progress"),
  ], { projectPaths: [project.path] });
  await executePlan(root, plan);
  return run;
}
