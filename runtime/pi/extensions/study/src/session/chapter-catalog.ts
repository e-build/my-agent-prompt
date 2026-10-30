import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StudyPhase, StudyPhaseStatus, StudyState } from "./study-state.ts";

export const PHASE_ORDER: StudyPhase[] = ["diagnosis", "concept", "lab", "test", "review"];

/** Short Korean names shown in menus and accepted as arguments. */
export const PHASE_KO: Record<StudyPhase, string> = {
  diagnosis: "진단",
  concept: "개념",
  lab: "실습",
  test: "시험",
  review: "복습",
};
const PHASE_LONG: Record<StudyPhase, string> = {
  diagnosis: "사전 진단",
  concept: "개념 학습",
  lab: "프로젝트 실습",
  test: "완료 시험",
  review: "복습",
};
const STATUS_KO: Record<StudyPhaseStatus, string> = {
  not_started: "시작 전",
  in_progress: "진행 중",
  awaiting_submission: "제출 대기",
  awaiting_grade: "채점 대기",
  awaiting_review: "결과 확인 대기",
  completed: "완료",
  relearn_required: "재학습 필요",
  skipped_understood: "건너뜀",
  blocked: "막힘",
};
const ALIASES: Record<string, StudyPhase> = {
  진단: "diagnosis",
  사전진단: "diagnosis",
  개념: "concept",
  개념학습: "concept",
  실습: "lab",
  시험: "test",
  테스트: "test",
  복습: "review",
};

export function parsePhase(value: string): StudyPhase | undefined {
  const key = value.trim().replace(/\s+/g, "");
  if ((PHASE_ORDER as string[]).includes(key)) return key as StudyPhase;
  return ALIASES[key];
}

export function phaseLabel(phase: StudyPhase): string {
  return PHASE_LONG[phase];
}

export type CatalogChapter = {
  slug: string;
  number: string;
  title: string;
  phases: Record<StudyPhase, StudyPhaseStatus>;
  next: StudyPhase;
  active: boolean;
};

export type ChapterCatalog = { projectRoot: string; activePhase?: StudyPhase; chapters: CatalogChapter[] };

function done(status: StudyPhaseStatus): boolean {
  return status === "completed" || status === "skipped_understood";
}

export function nextPhaseOf(phases: Record<StudyPhase, StudyPhaseStatus>): StudyPhase {
  return PHASE_ORDER.find((phase) => !done(phases[phase])) ?? "review";
}

async function titleOf(projectRoot: string, slug: string): Promise<string> {
  try {
    const content = await readFile(join(projectRoot, slug, "README.md"), "utf8");
    return content.match(/^#\s+(?:ch[-\s]*\d+\s*[—:.-]?\s*)?(.+)$/im)?.[1]?.trim() || slug;
  } catch {
    return slug;
  }
}

/**
 * Read-only chapter list for completion and menus. Never migrates or writes
 * state; a missing or unreadable state yields chapters with unknown status.
 */
export async function readChapterCatalog(projectRoot: string): Promise<ChapterCatalog> {
  let state: StudyState | null = null;
  try {
    state = JSON.parse(await readFile(join(projectRoot, ".study", "state.json"), "utf8"));
  } catch {
    state = null;
  }
  let slugs: string[] = Object.keys(state?.chapters ?? {});
  try {
    const dirs = (await readdir(projectRoot, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && /^ch-\d+-/.test(e.name))
      .map((e) => e.name);
    slugs = [...new Set([...slugs, ...dirs])];
  } catch {
    /* not a project */
  }
  const chapters: CatalogChapter[] = [];
  for (const slug of slugs.sort()) {
    const source = state?.chapters?.[slug];
    const phases = Object.fromEntries(
      PHASE_ORDER.map((p) => [p, (source?.[p]?.status ?? "not_started") as StudyPhaseStatus]),
    ) as Record<StudyPhase, StudyPhaseStatus>;
    chapters.push({
      slug,
      number: slug.match(/^ch-(\d+)-/)?.[1] ?? slug,
      title: await titleOf(projectRoot, slug),
      phases,
      next: nextPhaseOf(phases),
      active: state?.activeChapter === slug,
    });
  }
  return { projectRoot, activePhase: state?.activePhase, chapters };
}

export function chapterDescription(chapter: CatalogChapter): string {
  const status = chapter.phases[chapter.next];
  const allDone = PHASE_ORDER.every((p) => done(chapter.phases[p]));
  if (allDone) return "모든 단계 완료";
  return `${PHASE_LONG[chapter.next]} ${STATUS_KO[status]}${chapter.active ? " · 현재 챕터" : ""}`;
}

type Completion = { value: string; label: string; description?: string };

/** `/study-chapter ` argument completion: chapter first, then phase. */
export function chapterArgumentCompletions(catalog: ChapterCatalog, prefix: string): Completion[] | null {
  const tokens = prefix.split(/\s+/);
  if (tokens.length === 1) {
    const typed = tokens[0];
    const items = catalog.chapters
      .filter((c) => !typed || c.number.startsWith(typed) || c.slug.includes(typed) || c.title.includes(typed))
      .map((c) => ({ value: c.number, label: `${c.number}  ${c.title}`, description: chapterDescription(c) }));
    const phaseItems = PHASE_ORDER.filter((p) => !typed || PHASE_KO[p].startsWith(typed) || p.startsWith(typed)).map((p) => ({
      value: PHASE_KO[p],
      label: PHASE_KO[p],
      description: `현재 챕터의 ${PHASE_LONG[p]}`,
    }));
    const all = typed ? [...items, ...phaseItems] : items;
    return all.length ? all : null;
  }
  if (tokens.length !== 2) return null;
  const chapter = catalog.chapters.find((c) => c.number === tokens[0] || c.slug === tokens[0]);
  if (!chapter) return null;
  const typed = tokens[1];
  const ordered = [chapter.next, ...PHASE_ORDER.filter((p) => p !== chapter.next)];
  const items = ordered
    .filter((p) => !typed || PHASE_KO[p].startsWith(typed) || p.startsWith(typed))
    .map((p) => ({
      value: `${tokens[0]} ${PHASE_KO[p]}`,
      label: PHASE_KO[p],
      description: `${PHASE_LONG[p]} · ${STATUS_KO[chapter.phases[p]]}${p === chapter.next ? " · 다음 단계" : ""}`,
    }));
  return items.length ? items : null;
}

export type MenuAction =
  | { type: "open"; chapterSlug: string; phase: StudyPhase }
  | { type: "pick-chapter" }
  | { type: "pick-phase"; chapterSlug: string }
  | { type: "start-review"; chapterSlug: string }
  | { type: "restart-diagnosis"; chapterSlug: string }
  | { type: "recover-saves" };

export type MenuItem = { label: string; action: MenuAction };

/** Choices shown by `/study-chapter` without arguments. */
export function buildChapterMenu(
  catalog: ChapterCatalog,
  context: { registered: boolean; staleDiagnosis: (chapterSlug: string) => boolean; pendingSaves?: number },
): MenuItem[] {
  const items: MenuItem[] = [];
  if (context.pendingSaves)
    items.push({ label: `⚠ 중단된 저장 정리 (${context.pendingSaves}건)`, action: { type: "recover-saves" } });
  // Resume only real unfinished work: a core phase, or a review already in progress.
  const unfinished = (c: CatalogChapter) =>
    PHASE_ORDER.slice(0, 4).some((p) => !done(c.phases[p])) || c.phases.review === "in_progress";
  const current =
    catalog.chapters.find((c) => c.active && unfinished(c)) ?? catalog.chapters.find(unfinished);
  if (current)
    items.push({
      label: `▶ 이어서: ${current.number} ${current.title} — ${PHASE_LONG[current.next]}`,
      action: { type: "open", chapterSlug: current.slug, phase: current.next },
    });
  for (const chapter of catalog.chapters) {
    if (context.staleDiagnosis(chapter.slug))
      items.push({
        label: `↻ ${chapter.number} 멈춘 예전 진단을 대화형 진단으로 다시 시작`,
        action: { type: "restart-diagnosis", chapterSlug: chapter.slug },
      });
  }
  if (context.registered) {
    for (const chapter of catalog.chapters) {
      if (done(chapter.phases.test) && chapter.phases.review === "not_started")
        items.push({
          label: `🔁 ${chapter.number} ${chapter.title} — 복습 시작`,
          action: { type: "start-review", chapterSlug: chapter.slug },
        });
    }
  }
  if (current)
    items.push({ label: `${current.number} 챕터의 다른 단계 고르기`, action: { type: "pick-phase", chapterSlug: current.slug } });
  if (catalog.chapters.length > 1 || !current) items.push({ label: "챕터 고르기", action: { type: "pick-chapter" } });
  return items;
}
