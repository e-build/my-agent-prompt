import { loadChains, loadItem } from "../knowledge/knowledge-store.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import { assertDate, localDate } from "./review-date.ts";
import { listSchedules } from "./review-store.ts";

export type DueItem = {
  knowledgeId: string;
  /** Display name only; statements and answers are never included. */
  name: string;
  dueDate: string;
  timing: "overdue" | "today" | "future";
  round: number;
  totalRounds: number;
  projectId: string;
  chapterSlug: string;
};

export type DueGroup = { reason: string; knowledgeIds: string[] };

/**
 * Read-only list of reviews due today (overdue first). No daily limit: the
 * learner stops any time and the rest stay due with unchanged dates.
 */
export async function dueReviews(
  root: string,
  options: { today?: string; projectId?: string; chapterSlug?: string; includeFuture?: boolean } = {},
): Promise<{ today: string; items: DueItem[]; groups: DueGroup[] }> {
  const workspace = await readWorkspace(root);
  const today = options.today ? assertDate(options.today) : localDate(new Date(), workspace.manifest.timezone);
  const items: DueItem[] = [];
  for (const schedule of await listSchedules(root)) {
    if (schedule.status !== "active" || !schedule.dueDate) continue;
    if (options.projectId && schedule.origin.projectId !== options.projectId) continue;
    if (options.chapterSlug && schedule.origin.chapterSlug !== options.chapterSlug) continue;
    const timing = schedule.dueDate < today ? "overdue" : schedule.dueDate === today ? "today" : "future";
    if (timing === "future" && !options.includeFuture) continue;
    const item = await loadItem(root, schedule.knowledgeId);
    items.push({
      knowledgeId: schedule.knowledgeId,
      name: item?.name ?? "(지식 파일 없음)",
      dueDate: schedule.dueDate,
      timing,
      round: schedule.nextStage + 1,
      totalRounds: schedule.intervals.length,
      projectId: schedule.origin.projectId,
      chapterSlug: schedule.origin.chapterSlug,
    });
  }
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.knowledgeId.localeCompare(b.knowledgeId));
  return { today, items, groups: await groupCandidates(root, items) };
}

/** Suggestions for asking related items together; judgement stays per proposition. */
async function groupCandidates(root: string, items: DueItem[]): Promise<DueGroup[]> {
  const ids = new Set(items.map((i) => i.knowledgeId));
  const groups: DueGroup[] = [];
  const used = new Set<string>();
  for (const chain of await loadChains(root)) {
    if (chain.retired) continue;
    const members = [...chain.premiseRefs, chain.conclusionRef].map((r) => r.id).filter((id) => ids.has(id) && !used.has(id));
    if (members.length >= 2) {
      members.forEach((id) => used.add(id));
      groups.push({ reason: `추론 사슬 ${chain.id}`, knowledgeIds: members });
    }
  }
  const byChapter = new Map<string, string[]>();
  for (const item of items) {
    if (used.has(item.knowledgeId)) continue;
    const key = `${item.projectId}/${item.chapterSlug}`;
    byChapter.set(key, [...(byChapter.get(key) ?? []), item.knowledgeId]);
  }
  for (const [key, members] of byChapter) groups.push({ reason: `같은 챕터 ${key}`, knowledgeIds: members });
  return groups;
}
