import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PHASES, isDone, type PhaseStatus, type StudyPhase } from "../state/study-state.ts";

export const PHASE_KO: Record<StudyPhase, string> = {
  concept: "개념",
  lab: "실습",
  test: "시험",
  review: "복습",
};
const PHASE_LONG: Record<StudyPhase, string> = {
  concept: "개념 학습",
  lab: "프로젝트 실습",
  test: "완료 시험",
  review: "복습",
};
const STATUS_KO: Record<PhaseStatus, string> = {
  not_started: "시작 전",
  in_progress: "진행 중",
  completed: "완료",
  relearn_required: "재학습 필요",
  skipped_understood: "건너뜀",
  blocked: "막힘",
};
const ALIASES: Record<string, StudyPhase> = {
  개념: "concept",
  개념학습: "concept",
  실습: "lab",
  시험: "test",
  테스트: "test",
  복습: "review",
};

export function parsePhase(value: string): StudyPhase | undefined {
  const key = value.trim().replace(/\s+/g, "");
  if ((PHASES as readonly string[]).includes(key)) return key as StudyPhase;
  return ALIASES[key];
}

export function phaseLabel(phase: StudyPhase): string {
  return PHASE_LONG[phase];
}

export type CatalogChapter = {
  slug: string;
  number: string;
  title: string;
  phases: Record<StudyPhase, PhaseStatus>;
  next: StudyPhase;
  active: boolean;
};

export type ChapterCatalog = {
  projectRoot: string;
  activePhase?: StudyPhase;
  chapters: CatalogChapter[];
};

export function nextPhaseOf(phases: Record<StudyPhase, PhaseStatus>): StudyPhase {
  return PHASES.find((phase) => !isDone(phases[phase])) ?? "review";
}

export async function chapterTitle(projectRoot: string, slug: string): Promise<string> {
  try {
    const content = await readFile(join(projectRoot, slug, "README.md"), "utf8");
    return content.match(/^#\s+(?:ch[-\s]*\d+\s*[—:.-]?\s*)?(.+)$/im)?.[1]?.trim() || slug;
  } catch {
    return slug;
  }
}

/**
 * Read-only chapter list for completion and menus. Never writes state; a missing
 * or unreadable state yields chapters with unknown status.
 */
export async function readChapterCatalog(projectRoot: string): Promise<ChapterCatalog> {
  let state: { activeChapter?: string; activePhase?: string; chapters?: Record<string, any> } | null;
  try {
    state = JSON.parse(await readFile(join(projectRoot, ".study", "state.json"), "utf8"));
  } catch {
    state = null;
  }
  let slugs = Object.keys(state?.chapters ?? {});
  try {
    const dirs = (await readdir(projectRoot, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && /^ch-\d+-/.test(e.name))
      .map((e) => e.name);
    slugs = [...new Set([...slugs, ...dirs])];
  } catch {
    slugs = [];
  }
  const chapters: CatalogChapter[] = [];
  for (const slug of slugs.sort()) {
    const source = state?.chapters?.[slug];
    const phases = Object.fromEntries(
      PHASES.map((p) => {
        const status = source?.[p]?.status;
        return [p, status in STATUS_KO ? status : status?.startsWith?.("awaiting_") ? "in_progress" : "not_started"];
      }),
    ) as Record<StudyPhase, PhaseStatus>;
    chapters.push({
      slug,
      number: slug.match(/^ch-(\d+)-/)?.[1] ?? slug,
      title: await chapterTitle(projectRoot, slug),
      phases,
      next: nextPhaseOf(phases),
      active: state?.activeChapter === slug,
    });
  }
  const activePhase = (PHASES as readonly string[]).includes(state?.activePhase ?? "")
    ? (state!.activePhase as StudyPhase)
    : undefined;
  return { projectRoot, activePhase, chapters };
}

export function chapterDescription(chapter: CatalogChapter): string {
  if (PHASES.every((p) => isDone(chapter.phases[p]))) return "모든 단계 완료";
  const status = chapter.phases[chapter.next];
  return `${PHASE_LONG[chapter.next]} ${STATUS_KO[status]}${chapter.active ? " · 현재 챕터" : ""}`;
}

type Completion = { value: string; label: string; description?: string };

/** `/study-chapter ` argument completion: chapter first, then phase. */
export function chapterArgumentCompletions(
  catalog: ChapterCatalog,
  prefix: string,
): Completion[] | null {
  const tokens = prefix.split(/\s+/);
  if (tokens.length === 1) {
    const typed = tokens[0];
    const items = catalog.chapters
      .filter(
        (c) => !typed || c.number.startsWith(typed) || c.slug.includes(typed) || c.title.includes(typed),
      )
      .map((c) => ({ value: c.number, label: `${c.number}  ${c.title}`, description: chapterDescription(c) }));
    const phaseItems = PHASES.filter(
      (p) => !typed || PHASE_KO[p].startsWith(typed) || p.startsWith(typed),
    ).map((p) => ({ value: PHASE_KO[p], label: PHASE_KO[p], description: `현재 챕터의 ${PHASE_LONG[p]}` }));
    const all = typed ? [...items, ...phaseItems] : items;
    return all.length ? all : null;
  }
  if (tokens.length !== 2) return null;
  const chapter = catalog.chapters.find((c) => c.number === tokens[0] || c.slug === tokens[0]);
  if (!chapter) return null;
  const typed = tokens[1];
  const ordered = [chapter.next, ...PHASES.filter((p) => p !== chapter.next)];
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
  | { type: "review" };

export type MenuItem = { label: string; action: MenuAction };

export function buildChapterMenu(catalog: ChapterCatalog, context: { dueReviews: number }): MenuItem[] {
  const items: MenuItem[] = [];
  if (context.dueReviews)
    items.push({ label: `🔁 오늘 할 복습 ${context.dueReviews}개`, action: { type: "review" } });
  const unfinished = (c: CatalogChapter) =>
    (["concept", "lab", "test"] as const).some((p) => !isDone(c.phases[p]));
  const current =
    catalog.chapters.find((c) => c.active && unfinished(c)) ?? catalog.chapters.find(unfinished);
  if (current)
    items.push({
      label: `▶ 이어서: ${current.number} ${current.title} — ${PHASE_LONG[current.next]}`,
      action: { type: "open", chapterSlug: current.slug, phase: current.next },
    });
  if (current)
    items.push({
      label: `${current.number} 챕터의 다른 단계 고르기`,
      action: { type: "pick-phase", chapterSlug: current.slug },
    });
  if (catalog.chapters.length > 1 || !current)
    items.push({ label: "챕터 고르기", action: { type: "pick-chapter" } });
  return items;
}
