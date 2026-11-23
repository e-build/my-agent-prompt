import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PHASES = ["concept", "lab", "test", "review"] as const;
export type StudyPhase = (typeof PHASES)[number];

export const STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "relearn_required",
  "skipped_understood",
  "blocked",
] as const;
export type PhaseStatus = (typeof STATUSES)[number];

export type PhaseState = {
  status: PhaseStatus;
  updatedAt: string;
  attempt?: number;
  score?: number;
  maxScore?: number;
  reason?: string;
};
export type ChapterState = Record<StudyPhase, PhaseState>;

export type StudyState = {
  version: 1;
  activeChapter?: string;
  activePhase?: StudyPhase;
  updatedAt: string;
  chapters: Record<string, ChapterState>;
};

const DONE: PhaseStatus[] = ["completed", "skipped_understood"];
const now = () => new Date().toISOString();

export function studyStatePath(projectRoot: string): string {
  return join(projectRoot, ".study", "state.json");
}

function emptyChapter(): ChapterState {
  const at = now();
  return Object.fromEntries(PHASES.map((p) => [p, { status: "not_started", updatedAt: at }])) as ChapterState;
}

async function chapterDirs(projectRoot: string): Promise<string[]> {
  const entries = await readdir(projectRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && /^ch-\d+-/.test(e.name))
    .map((e) => e.name)
    .sort();
}

/** Old states carry a diagnosis phase and browser waiting statuses; neither exists any more. */
function normalizeChapter(raw: Record<string, Partial<PhaseState> | undefined>): ChapterState {
  const chapter = emptyChapter();
  for (const phase of PHASES) {
    const value = raw[phase];
    if (!value) continue;
    const status = (STATUSES as readonly string[]).includes(value.status ?? "")
      ? (value.status as PhaseStatus)
      : String(value.status).startsWith("awaiting_")
        ? "in_progress"
        : "not_started";
    chapter[phase] = { ...value, status, updatedAt: value.updatedAt ?? now() } as PhaseState;
  }
  return chapter;
}

export async function loadStudyState(projectRoot: string): Promise<StudyState> {
  const path = studyStatePath(projectRoot);
  let parsed: Partial<StudyState> & { chapters?: Record<string, Record<string, any>> } = {};
  try {
    const text = await readFile(path, "utf8");
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`state.json이 손상됐습니다. 직접 확인하세요: ${path}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const chapters: Record<string, ChapterState> = {};
  for (const [slug, raw] of Object.entries(parsed.chapters ?? {})) chapters[slug] = normalizeChapter(raw);
  for (const slug of await chapterDirs(projectRoot)) chapters[slug] ??= emptyChapter();
  const sorted = Object.fromEntries(Object.entries(chapters).sort(([a], [b]) => a.localeCompare(b)));
  return {
    version: 1,
    ...(parsed.activeChapter && sorted[parsed.activeChapter] ? { activeChapter: parsed.activeChapter } : {}),
    ...((PHASES as readonly string[]).includes(parsed.activePhase ?? "")
      ? { activePhase: parsed.activePhase }
      : {}),
    updatedAt: parsed.updatedAt ?? now(),
    chapters: sorted,
  };
}

export async function saveStudyState(projectRoot: string, state: StudyState): Promise<void> {
  const target = studyStatePath(projectRoot);
  await mkdir(join(projectRoot, ".study"), { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify({ ...state, updatedAt: now() }, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

export async function setPhase(
  projectRoot: string,
  chapterSlug: string,
  phase: StudyPhase,
  status: PhaseStatus,
  patch: Omit<PhaseState, "status" | "updatedAt"> = {},
): Promise<StudyState> {
  if (!(PHASES as readonly string[]).includes(phase)) throw new Error(`알 수 없는 phase입니다: ${phase}`);
  if (!(STATUSES as readonly string[]).includes(status))
    throw new Error(`알 수 없는 status입니다: ${status} (가능: ${STATUSES.join(", ")})`);
  const state = await loadStudyState(projectRoot);
  const chapter = state.chapters[chapterSlug];
  if (!chapter) throw new Error(`챕터를 찾지 못했습니다: ${chapterSlug}`);
  chapter[phase] = { ...chapter[phase], ...patch, status, updatedAt: now() };
  state.activeChapter = chapterSlug;
  state.activePhase = phase;
  await saveStudyState(projectRoot, state);
  return state;
}

export function nextPhase(chapter: ChapterState): StudyPhase {
  return PHASES.find((p) => !DONE.includes(chapter[p].status)) ?? "review";
}

export function isDone(status: PhaseStatus): boolean {
  return DONE.includes(status);
}
