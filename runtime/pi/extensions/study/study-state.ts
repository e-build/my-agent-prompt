import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export const STUDY_STATE_VERSION = 1 as const;

export type StudyPhase = "diagnosis" | "concept" | "lab" | "test" | "review";
export type StudyPhaseStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_submission"
  | "awaiting_grade"
  | "awaiting_review"
  | "completed"
  | "relearn_required"
  | "skipped_understood"
  | "blocked";

export type PhaseState = {
  status: StudyPhaseStatus;
  updatedAt: string;
  attempt?: number;
  score?: number;
  maxScore?: number;
  evidence?: string[];
  reason?: string;
  sessionId?: string;
};

export type ChapterState = Record<StudyPhase, PhaseState>;

export type StudyState = {
  version: typeof STUDY_STATE_VERSION;
  projectRoot: string;
  activeChapter?: string;
  activePhase?: StudyPhase;
  createdAt: string;
  updatedAt: string;
  chapters: Record<string, ChapterState>;
};

const PHASES: StudyPhase[] = ["diagnosis", "concept", "lab", "test", "review"];

function now(): string {
  return new Date().toISOString();
}

function phase(status: StudyPhaseStatus, evidence?: string[]): PhaseState {
  return { status, updatedAt: now(), ...(evidence?.length ? { evidence } : {}) };
}

export function createEmptyChapterState(): ChapterState {
  return {
    diagnosis: phase("not_started"),
    concept: phase("not_started"),
    lab: phase("not_started"),
    test: phase("not_started"),
    review: phase("not_started"),
  };
}

async function text(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function hasRealDiagnosis(content: string): boolean {
  return /상태:\s*채점 완료|총점:\s*\d+\s*\/\s*\d+|diagnosisId:/i.test(content);
}

function hasRealConcept(content: string): boolean {
  if (!content.trim()) return false;
  if (/아직\s*개념\s*학습\s*전|#\s*개념\s*노트\s*\n\s*아직/i.test(content)) return false;
  return /##\s*(이 장에서 배우는 것|핵심 개념|단계별 작동 원리)/.test(content) || content.length > 500;
}

function hasPassedTest(content: string): boolean {
  if (needsRelearn(content)) return false;
  return /\bPASSED\b|passed:\s*true|통과\s*여부:\s*(PASSED|통과)|총점\s*\d+\s*\/\s*\d+\s*→\s*통과|채점 결과:\s*\*\*\d+\s*\/\s*\d+\s*\(통과\)/i.test(content);
}

function needsRelearn(content: string): boolean {
  return /미통과|재학습 필요|passed:\s*false/i.test(content);
}

function hasRealReview(content: string): boolean {
  if (!content.trim() || /학습 후\s*\/study-review|학습 후.*생성/i.test(content)) return false;
  return /\d{4}-\d{2}-\d{2}|완료|다음 복습|반복 기록/i.test(content);
}

async function inferLab(chapterDir: string): Promise<PhaseState> {
  const labDir = join(chapterDir, "lab");
  let entries: string[] = [];
  try {
    entries = await readdir(labDir);
  } catch {
    return phase("not_started");
  }
  const readme = await text(join(labDir, "README.md"));
  const artifacts = entries.filter((name) => name !== "README.md" && !name.endsWith(".html"));
  const hasCompletedMarks = /-\s*\[(x|~)\]/i.test(readme);
  const hasOpenMarks = /-\s*\[\s\]/.test(readme);
  if (artifacts.length > 0 || (hasCompletedMarks && !hasOpenMarks)) {
    return phase("completed", [join(basename(chapterDir), "lab"), ...artifacts.map((name) => join(basename(chapterDir), "lab", name))]);
  }
  if (/##\s*목표|##\s*단계/.test(readme) && readme.length > 300) return phase("in_progress");
  return phase("not_started");
}

export async function migrateChapterState(projectRoot: string, chapterSlug: string): Promise<ChapterState> {
  const dir = join(projectRoot, chapterSlug);
  const diagnosis = await text(join(dir, "diagnosis.md"));
  const concept = await text(join(dir, "concept.md"));
  const test = await text(join(dir, "test.md"));
  const review = await text(join(dir, "review", "schedule.md"));

  const state = createEmptyChapterState();
  state.diagnosis = hasRealDiagnosis(diagnosis)
    ? phase("completed", [join(chapterSlug, "diagnosis.md")])
    : phase("not_started");
  state.concept = hasRealConcept(concept)
    ? phase("completed", [join(chapterSlug, "concept.md")])
    : phase("not_started");
  state.lab = await inferLab(dir);
  state.test = hasPassedTest(test)
    ? phase("completed", [join(chapterSlug, "test.md")])
    : needsRelearn(test)
      ? phase("relearn_required", [join(chapterSlug, "test.md")])
      : /진행 중|Attempt\s+\d+/i.test(test) && !/학습 후 생성/i.test(test)
        ? phase("in_progress", [join(chapterSlug, "test.md")])
        : phase("not_started");
  state.review = hasRealReview(review)
    ? phase("completed", [join(chapterSlug, "review", "schedule.md")])
    : phase("not_started");
  return state;
}

export async function migrateStudyState(projectRoot: string): Promise<StudyState> {
  const entries = await readdir(projectRoot, { withFileTypes: true });
  const chapterSlugs = entries
    .filter((entry) => entry.isDirectory() && /^ch-\d+-/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const timestamp = now();
  const chapters: Record<string, ChapterState> = {};
  for (const slug of chapterSlugs) chapters[slug] = await migrateChapterState(projectRoot, slug);
  const state: StudyState = {
    version: STUDY_STATE_VERSION,
    projectRoot,
    createdAt: timestamp,
    updatedAt: timestamp,
    chapters,
  };
  const next = resolveNextTarget(state);
  if (next) {
    state.activeChapter = next.chapterSlug;
    state.activePhase = next.phase;
  }
  return state;
}

export function studyStatePath(projectRoot: string): string {
  return join(projectRoot, ".study", "state.json");
}

export async function saveStudyState(projectRoot: string, state: StudyState): Promise<void> {
  const dir = join(projectRoot, ".study");
  await mkdir(dir, { recursive: true });
  state.updatedAt = now();
  const target = studyStatePath(projectRoot);
  const temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

export async function loadStudyState(projectRoot: string): Promise<StudyState> {
  try {
    const parsed = JSON.parse(await readFile(studyStatePath(projectRoot), "utf8")) as StudyState;
    if (parsed.version !== STUDY_STATE_VERSION || !parsed.chapters) throw new Error("unsupported study state");
    return parsed;
  } catch {
    const migrated = await migrateStudyState(projectRoot);
    await saveStudyState(projectRoot, migrated);
    return migrated;
  }
}

function isDone(status: StudyPhaseStatus): boolean {
  return status === "completed" || status === "skipped_understood";
}

export function resolveNextPhase(chapter: ChapterState): StudyPhase {
  for (const phaseName of PHASES) {
    const status = chapter[phaseName].status;
    if (!isDone(status)) return phaseName;
  }
  return "review";
}

export function resolveNextTarget(state: StudyState): { chapterSlug: string; phase: StudyPhase } | null {
  const slugs = Object.keys(state.chapters).sort();
  if (!slugs.length) return null;
  const corePhases: StudyPhase[] = ["diagnosis", "concept", "lab", "test"];
  for (const chapterSlug of slugs) {
    const phaseName = corePhases.find((name) => !isDone(state.chapters[chapterSlug][name].status));
    if (phaseName) return { chapterSlug, phase: phaseName };
  }
  const reviewChapter = slugs.find((chapterSlug) => !isDone(state.chapters[chapterSlug].review.status));
  return reviewChapter ? { chapterSlug: reviewChapter, phase: "review" } : { chapterSlug: slugs[slugs.length - 1], phase: "review" };
}

export function updatePhaseState(
  state: StudyState,
  chapterSlug: string,
  phaseName: StudyPhase,
  patch: Partial<PhaseState> & Pick<PhaseState, "status">,
): StudyState {
  const chapter = state.chapters[chapterSlug] ?? createEmptyChapterState();
  state.chapters[chapterSlug] = chapter;
  chapter[phaseName] = { ...chapter[phaseName], ...patch, updatedAt: now() };
  state.activeChapter = chapterSlug;
  state.activePhase = phaseName;
  state.updatedAt = now();
  return state;
}
