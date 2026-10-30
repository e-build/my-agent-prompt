import type { ChangeRecord } from "../knowledge/knowledge-changes.ts";
import type { PlannedChange } from "../workspace/change-plan.ts";
import type { ReviewSchedule } from "./review-schedule.ts";
import { encodeSchedule, loadSchedule, schedulePath } from "./review-store.ts";

function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Keep review schedules consistent with knowledge merges in the same atomic
 * change. A merge never promotes a stage without evidence: the canonical view
 * takes the lower stage and the earlier due date, and keeps snapshots of the
 * absorbed schedule so unmerge restores both originals exactly.
 */
export async function reviewMergeChanges(root: string, record: ChangeRecord): Promise<PlannedChange[]> {
  if (record.operation === "merge") {
    const target = record.mergeAdded?.targetId;
    const sourceId = Object.keys(record.after).find((id) => id !== target);
    if (!target || !sourceId) return [];
    const source = await loadSchedule(root, sourceId);
    if (!source) return [];
    const current = await loadSchedule(root, target);
    let merged: ReviewSchedule;
    if (!current) {
      merged = { ...source, knowledgeId: target, absorbed: [source] };
      merged.cycleId = `${source.cycleId}+merged`;
    } else if (current.status === "completed" && source.status === "completed") {
      merged = { ...current, absorbed: [...(current.absorbed ?? []), source], preMerge: { ...(current.preMerge ?? {}), [sourceId]: current } };
    } else {
      const active = [current, source].filter((s) => s.status === "active");
      const stage = Math.min(...active.map((s) => s.nextStage));
      merged = {
        ...current,
        status: "active",
        nextStage: stage,
        dueDate: active.map((s) => s.dueDate).reduce(earlier, null),
        absorbed: [...(current.absorbed ?? []), source],
        preMerge: { ...(current.preMerge ?? {}), [sourceId]: current },
      };
    }
    return [
      { path: schedulePath(target), after: encodeSchedule(merged) },
      { path: schedulePath(sourceId), after: encodeSchedule({ ...source, status: "merged", mergedInto: target }) },
    ];
  }
  if (record.operation === "unmerge") {
    const entries = Object.entries(record.before);
    const sourceEntry = entries.find(([, item]) => item?.mergedInto);
    if (!sourceEntry) return [];
    const [sourceId, sourceItem] = sourceEntry;
    const targetId = sourceItem!.mergedInto!;
    const target = await loadSchedule(root, targetId);
    const absorbed = target?.absorbed?.find((s) => s.knowledgeId === sourceId);
    if (!target || !absorbed) return [];
    const remaining = target.absorbed!.filter((s) => s !== absorbed);
    const changes: PlannedChange[] = [{ path: schedulePath(sourceId), after: encodeSchedule(absorbed) }];
    if (target.cycleId === `${absorbed.cycleId}+merged` && !remaining.length) {
      changes.push({ path: schedulePath(targetId), after: null });
    } else {
      // Recover the target's own pre-merge view when nothing happened since the merge.
      const restored = restoreTarget(target, absorbed, remaining);
      changes.push({ path: schedulePath(targetId), after: encodeSchedule(restored) });
    }
    return changes;
  }
  return [];
}

function restoreTarget(target: ReviewSchedule, absorbed: ReviewSchedule, remaining: ReviewSchedule[]): ReviewSchedule {
  const preMerge = target.preMerge?.[absorbed.knowledgeId];
  // No reviews since the merge: restore the exact pre-merge schedule.
  if (preMerge && target.history.length === preMerge.history.length) return preMerge;
  // Reviews happened after the merge: keep that progress, only detach the source.
  const next: ReviewSchedule = { ...target };
  if (remaining.length) next.absorbed = remaining;
  else delete next.absorbed;
  const rest = { ...(target.preMerge ?? {}) };
  delete rest[absorbed.knowledgeId];
  if (Object.keys(rest).length) next.preMerge = rest;
  else delete next.preMerge;
  return next;
}
