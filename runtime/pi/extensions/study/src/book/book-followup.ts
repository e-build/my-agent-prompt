import { loadBookInstructions } from "./book-instructions.ts";
import type { PendingChapter } from "./book-pending.ts";

/** Agent follow-up that asks for the textbook rebuild of one finished chapter. */
export async function bookFollowUp(chapter: PendingChapter): Promise<string> {
  const plan = JSON.stringify({ projectSlug: chapter.projectSlug, chapterSlug: chapter.chapterSlug });
  const learnedIn = chapter.completedOn
    ? `- record_learned: ${JSON.stringify({ projectId: chapter.projectId, chapterSlug: chapter.chapterSlug, completedOn: chapter.completedOn })}`
    : "- 완료일 기록 없음: record_learned의 completedOn은 오늘 날짜(YYYY-MM-DD)로 쓰고 보고에 그렇게 적는다.";
  return [
    "# STUDY_BOOK_PENDING",
    "",
    `교과서 정리 대상: ${chapter.projectSlug} · ${chapter.chapterSlug}`,
    `- 먼저 study_book action=plan payloadJson=${plan}`,
    learnedIn,
    "- 정리가 실패하거나 중단돼도 챕터 완료는 그대로다. 다음에 /study-chapter 메뉴의 \"교과서 정리\"로 이어서 할 수 있다.",
    "",
    await loadBookInstructions(),
  ].join("\n");
}
