import { randomUUID } from "node:crypto";
import type { ChangeRecord } from "../knowledge/knowledge-changes.ts";
import { readTextOptional } from "../workspace/atomic-file.ts";
import type { PlannedChange } from "../workspace/change-plan.ts";
import { abs, conceptHistoryPath, conceptPath, CONCEPTS_DIR, encodeConcept, loadConcepts } from "./book-store.ts";
import type { ConceptNode } from "./book-types.ts";

/** What a merge did to page membership, so unmerge restores it exactly. */
type MergeTrace = { schemaVersion: 1; sourceId: string; targetId: string; conceptId: string; replaced: boolean };
const tracePath = (sourceId: string) => `${CONCEPTS_DIR}/merges/${sourceId}.json`;

async function nodeChanges(root: string, record: ChangeRecord, node: ConceptNode, members: string[]): Promise<PlannedChange[]> {
  const next: ConceptNode = { ...node, members, version: node.version + 1, revisionId: `rev-${randomUUID()}`, parentRevisionIds: [node.revisionId] };
  const history = (await readTextOptional(abs(root, conceptHistoryPath(node.id)))) ?? "";
  const entry = { changeId: `knowledge:${record.changeId}`, revisionId: next.revisionId, parentRevisionIds: next.parentRevisionIds, operation: `knowledge-${record.operation}`, reason: record.reason, at: record.at, snapshot: next };
  return [
    { path: conceptPath(node.id), after: encodeConcept(next) },
    { path: conceptHistoryPath(node.id), after: `${history}${JSON.stringify(entry)}\n` },
  ];
}

/**
 * Keep "one page per proposition" true across knowledge merges, inside the
 * same atomic change. The absorbed proposition's page takes the target unless
 * the target already lives on another page; unmerge replays the trace.
 */
export async function bookMergeChanges(root: string, record: ChangeRecord): Promise<PlannedChange[]> {
  if (record.operation !== "merge" && record.operation !== "unmerge") return [];
  const nodes = (await loadConcepts(root)).filter((n) => !n.retired);
  if (record.operation === "merge") {
    const targetId = record.mergeAdded?.targetId;
    const sourceId = Object.keys(record.after).find((id) => id !== targetId);
    if (!targetId || !sourceId) return [];
    const holder = nodes.find((n) => n.members.includes(sourceId));
    if (!holder) return [];
    const targetPlaced = nodes.some((n) => n.members.includes(targetId));
    const members = targetPlaced ? holder.members.filter((m) => m !== sourceId) : holder.members.map((m) => (m === sourceId ? targetId : m));
    const trace: MergeTrace = { schemaVersion: 1, sourceId, targetId, conceptId: holder.id, replaced: !targetPlaced };
    return [...(await nodeChanges(root, record, holder, members)), { path: tracePath(sourceId), after: `${JSON.stringify(trace, null, 2)}\n` }];
  }
  const sourceId = Object.entries(record.before).find(([, item]) => item?.mergedInto)?.[0];
  if (!sourceId) return [];
  const raw = await readTextOptional(abs(root, tracePath(sourceId)));
  if (raw === null) return [];
  const trace = JSON.parse(raw) as MergeTrace;
  const holder = nodes.find((n) => n.id === trace.conceptId);
  const changes: PlannedChange[] = [{ path: tracePath(sourceId), after: null }];
  if (!holder || nodes.some((n) => n.members.includes(sourceId))) return changes;
  const members = trace.replaced
    ? holder.members.includes(trace.targetId)
      ? holder.members.map((m) => (m === trace.targetId ? sourceId : m))
      : [...holder.members, sourceId]
    : [...holder.members, sourceId];
  return [...(await nodeChanges(root, record, holder, members)), ...changes];
}
