import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan } from "../workspace/change-plan.ts";
import type { LabelRecord } from "./knowledge-clusters.ts";
import { loadItem } from "./knowledge-store.ts";
import { validateKnowledgeId } from "./knowledge-validation.ts";

export const CLUSTER_LABELS = "knowledge/clusters.jsonl";

/** Append-only label history: old records stay as an audit trail. */
export async function loadLabelRecords(root: string): Promise<LabelRecord[]> {
  const content = await readTextOptional(join(root, ...CLUSTER_LABELS.split("/")));
  if (!content) return [];
  return content
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((line) => {
      try {
        const r = JSON.parse(line);
        return typeof r?.label === "string" && Array.isArray(r.core) ? [r as LabelRecord] : [];
      } catch {
        return [];
      }
    });
}

/**
 * Name a knowledge region. The agent coins the label from the members'
 * names and statements; the record keeps the member core it was coined for.
 */
export async function labelCluster(
  root: string,
  input: { members: string[]; label: string; reason: string },
  now = () => new Date().toISOString(),
): Promise<LabelRecord> {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label || label.length > 40) throw new Error("label은 1~40자여야 합니다.");
  if (!input.reason?.trim()) throw new Error("reason(이름을 정한 근거)이 필요합니다.");
  const members = [...new Set(input.members ?? [])].sort();
  if (members.length < 2) throw new Error("무리에는 지식이 2개 이상 필요합니다.");
  for (const id of members) {
    validateKnowledgeId(id);
    if (!(await loadItem(root, id))) throw new Error(`지식을 찾지 못했습니다: ${id}`);
  }
  const record: LabelRecord = { id: `lab-${randomUUID().slice(0, 8)}`, label, core: members, at: now() };
  const previous = (await readTextOptional(join(root, ...CLUSTER_LABELS.split("/")))) ?? "";
  const plan = await preparePlan(root, `cluster-label-${record.id}`, [
    { path: CLUSTER_LABELS, after: `${previous}${JSON.stringify({ ...record, reason: input.reason.trim() })}\n` },
  ]);
  await executePlan(root, plan);
  return record;
}
