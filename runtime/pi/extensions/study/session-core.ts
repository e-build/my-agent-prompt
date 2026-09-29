export type SessionLike = {
  chapterSlug: string;
  attempt: number;
  status: string;
};

export type ChapterSessionLike = {
  chapterSlug: string;
  status: string;
};

export function findReusableTestSession<T extends SessionLike>(
  sessions: Iterable<T>,
  chapterSlug: string,
  attempt: number,
): T | null {
  for (const session of sessions) {
    if (session.chapterSlug === chapterSlug && session.attempt === attempt && session.status === "open") return session;
  }
  return null;
}

export function hasAssessmentSession<T extends ChapterSessionLike>(sessions: Iterable<T>, chapterSlug: string): boolean {
  for (const session of sessions) {
    if (session.chapterSlug === chapterSlug) return true;
  }
  return false;
}
