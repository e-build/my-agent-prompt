import { nextPhase, type StudyPhase, type StudyState } from "../state/study-state.ts";
import { parsePhase } from "./chapter-catalog.ts";

export function parseStudyChapterArgs(args: string): { chapterArg?: string; phaseArg?: StudyPhase } {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return {};
  const first = parsePhase(tokens[0]);
  if (first) return { phaseArg: first };
  if (!tokens[1]) return { chapterArg: tokens[0] };
  const phaseArg = parsePhase(tokens[1]);
  if (!phaseArg)
    throw new Error(`단계는 개념|실습|시험|복습 중 하나여야 합니다(영문도 가능): ${tokens[1]}`);
  return { chapterArg: tokens[0], phaseArg };
}

/** Chapter from a number (`01`), a slug, or part of a slug; defaults to the active or first unfinished one. */
export function resolveChapterSlug(state: StudyState, chapterArg?: string): string {
  const slugs = Object.keys(state.chapters);
  if (!chapterArg) {
    if (state.activeChapter && state.chapters[state.activeChapter]) return state.activeChapter;
    const unfinished = slugs.find((s) => nextPhase(state.chapters[s]) !== "review");
    if (unfinished ?? slugs[0]) return (unfinished ?? slugs[0])!;
    throw new Error("학습 챕터가 없습니다.");
  }
  if (state.chapters[chapterArg]) return chapterArg;
  const number = chapterArg.match(/^\d+$/)?.[0]?.padStart(2, "0");
  const candidates = slugs.filter((slug) =>
    number ? slug.startsWith(`ch-${number}-`) : slug.includes(chapterArg),
  );
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) throw new Error(`챕터를 찾지 못했습니다: ${chapterArg}`);
  throw new Error(`챕터가 여러 개 일치합니다: ${candidates.join(", ")}`);
}
