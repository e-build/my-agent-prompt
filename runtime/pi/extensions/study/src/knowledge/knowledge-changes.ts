import { randomUUID } from "node:crypto";
import { readTextOptional, sha256 } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan, type PlannedChange } from "../workspace/change-plan.ts";
import { encodeKnowledgeItem } from "./knowledge-codec.ts";
import {
  abs,
  CHAINS_FILE,
  changePath,
  encodeJsonl,
  historyPath,
  itemPath,
  loadChains,
  loadHistory,
  loadItem,
  requireItem,
} from "./knowledge-store.ts";
import type {
  KnowledgeChain,
  KnowledgeItem,
  KnowledgeOperation,
  KnowledgeRef,
  KnowledgeStatus,
  SourceRef,
} from "./knowledge-types.ts";
import { validateChains, validateKnowledgeItem } from "./knowledge-validation.ts";

type Draft = Omit<KnowledgeItem, "schemaVersion" | "id" | "version" | "revisionId" | "parentRevisionIds" | "mergedInto">;
type Patch = Partial<Pick<KnowledgeItem, "name" | "statement" | "conditions" | "scope" | "explanation">>;

export type KnowledgeChangeRequest = { changeId: string; reason: string } & (
  | { operation: "create"; item: Draft }
  | { operation: "add_expression"; id: string; expectedRevisionId: string; aliases?: string[]; sources?: SourceRef[] }
  | { operation: "revise"; id: string; expectedRevisionId: string; patch: Patch }
  | { operation: "set_status"; id: string; expectedRevisionId: string; status: KnowledgeStatus; sources?: SourceRef[] }
  | { operation: "merge"; sourceId: string; targetId: string; expectedRevisionIds: Record<string, string> }
  | { operation: "unmerge"; sourceId: string; expectedRevisionIds: Record<string, string> }
  | { operation: "undo"; targetChangeId: string }
  | { operation: "add_chain"; chain: Pick<KnowledgeChain, "premiseRefs" | "conclusionRef" | "sourceRefs"> }
  | { operation: "retire_chain"; chainId: string }
);

export type ChangeRecord = {
  changeId: string;
  operation: KnowledgeChangeRequest["operation"];
  reason: string;
  at: string;
  payloadSha256: string;
  before: Record<string, KnowledgeItem | null>;
  after: Record<string, KnowledgeItem>;
  /** Values the merge added to the target, removed again on unmerge. */
  mergeAdded?: { targetId: string; aliases: string[]; sources: SourceRef[] };
  chainsBefore?: string;
  chainsAfter?: string;
  chainId?: string;
};

export type KnowledgeChangeResult = {
  status: "committed" | "already_applied";
  changeId: string;
  items: KnowledgeItem[];
  chains?: KnowledgeChain[];
  summary: string;
};

export type ApplyOptions = {
  now?: () => string;
  /** Extra files (e.g. review schedule lineage) committed in the same plan. */
  extraChanges?: (record: ChangeRecord) => Promise<PlannedChange[]>;
};

const CHANGE_ID = /^[A-Za-z0-9_.-]{1,80}$/;

function newRevision(): string {
  return `rev-${randomUUID()}`;
}

function expectRevision(item: KnowledgeItem, expected: string | undefined): void {
  if (item.revisionId !== expected)
    throw new Error(
      `다른 변경이 먼저 저장됐습니다. 최신 내용을 다시 비교하세요: ${item.id} (현재 ${item.revisionId}, 기대 ${expected})`,
    );
}

function nextVersion(item: KnowledgeItem, changes: Partial<KnowledgeItem>): KnowledgeItem {
  const next = { ...item, ...changes, version: item.version + 1, revisionId: newRevision(), parentRevisionIds: [item.revisionId] };
  if ("mergedInto" in changes && changes.mergedInto === undefined) delete next.mergedInto;
  return validateKnowledgeItem(next);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function sourceKey(source: SourceRef): string {
  return `${source.materialId}|${source.locator}|${source.basis}`;
}

function mergeSources(base: SourceRef[], extra: SourceRef[]): SourceRef[] {
  const seen = new Set(base.map(sourceKey));
  return [...base, ...extra.filter((s) => !seen.has(sourceKey(s)) && seen.add(sourceKey(s)))];
}

async function computeRecord(root: string, request: KnowledgeChangeRequest, at: string, payloadSha256: string): Promise<ChangeRecord> {
  const record: ChangeRecord = { changeId: request.changeId, operation: request.operation, reason: request.reason, at, payloadSha256, before: {}, after: {} };
  const put = (before: KnowledgeItem | null, after: KnowledgeItem) => {
    record.before[after.id] = before;
    record.after[after.id] = after;
  };
  switch (request.operation) {
    case "create": {
      const item = validateKnowledgeItem({
        ...request.item,
        schemaVersion: 1,
        id: `k-${randomUUID()}`,
        version: 1,
        revisionId: newRevision(),
        parentRevisionIds: [],
      } as KnowledgeItem);
      put(null, item);
      break;
    }
    case "add_expression": {
      const item = await requireItem(root, request.id);
      expectRevision(item, request.expectedRevisionId);
      put(item, nextVersion(item, {
        aliases: uniqueStrings([...item.aliases, ...(request.aliases ?? [])]),
        sources: mergeSources(item.sources, request.sources ?? []),
      }));
      break;
    }
    case "revise": {
      const item = await requireItem(root, request.id);
      expectRevision(item, request.expectedRevisionId);
      const allowed: Patch = {};
      for (const key of ["name", "statement", "conditions", "scope", "explanation"] as const)
        if (request.patch?.[key] !== undefined) (allowed as any)[key] = request.patch[key];
      if (!Object.keys(allowed).length) throw new Error("revise에는 바꿀 내용이 필요합니다.");
      put(item, nextVersion(item, allowed));
      break;
    }
    case "set_status": {
      const item = await requireItem(root, request.id);
      expectRevision(item, request.expectedRevisionId);
      put(item, nextVersion(item, { status: request.status, sources: mergeSources(item.sources, request.sources ?? []) }));
      break;
    }
    case "merge": {
      if (request.sourceId === request.targetId) throw new Error("자기 자신에게 병합할 수 없습니다.");
      const source = await requireItem(root, request.sourceId);
      const target = await requireItem(root, request.targetId);
      expectRevision(source, request.expectedRevisionIds?.[source.id]);
      expectRevision(target, request.expectedRevisionIds?.[target.id]);
      if (source.mergedInto) throw new Error(`이미 병합된 지식입니다: ${source.id} → ${source.mergedInto}`);
      if (target.mergedInto) throw new Error(`병합 대상이 이미 다른 지식으로 병합돼 있습니다: ${target.id}`);
      const addedAliases = uniqueStrings([source.statement, ...source.aliases]).filter((a) => !target.aliases.includes(a) && a !== target.statement);
      const addedSources = source.sources.filter((s) => !target.sources.some((t) => sourceKey(t) === sourceKey(s)));
      put(target, nextVersion(target, { aliases: [...target.aliases, ...addedAliases], sources: [...target.sources, ...addedSources] }));
      put(source, nextVersion(source, { mergedInto: target.id }));
      record.mergeAdded = { targetId: target.id, aliases: addedAliases, sources: addedSources };
      break;
    }
    case "unmerge": {
      const source = await requireItem(root, request.sourceId);
      if (!source.mergedInto) throw new Error(`병합되지 않은 지식입니다: ${source.id}`);
      const target = await requireItem(root, source.mergedInto);
      expectRevision(source, request.expectedRevisionIds?.[source.id]);
      expectRevision(target, request.expectedRevisionIds?.[target.id]);
      const mergeRecord = await findMergeRecord(root, source.id, target.id);
      const added = mergeRecord?.mergeAdded ?? { targetId: target.id, aliases: [], sources: [] };
      put(target, nextVersion(target, {
        aliases: target.aliases.filter((a) => !added.aliases.includes(a)),
        sources: target.sources.filter((s) => !added.sources.some((x) => sourceKey(x) === sourceKey(s))),
      }));
      put(source, nextVersion(source, { mergedInto: undefined }));
      break;
    }
    case "undo": {
      const target = await loadRecord(root, request.targetChangeId);
      if (!target) throw new Error(`되돌릴 변경을 찾지 못했습니다: ${request.targetChangeId}`);
      if (target.chainsAfter !== undefined) {
        const current = (await readTextOptional(abs(root, CHAINS_FILE))) ?? "";
        if (current !== target.chainsAfter) throw new Error("이후 변경이 있어 되돌릴 수 없습니다. 추론 사슬을 직접 정리하세요.");
        record.chainsBefore = current;
        record.chainsAfter = target.chainsBefore ?? "";
      }
      for (const [id, after] of Object.entries(target.after)) {
        const current = await requireItem(root, id);
        if (current.revisionId !== after.revisionId)
          throw new Error(`이후 변경이 있어 되돌릴 수 없습니다: ${id}. 최신 버전에서 다시 수정하세요.`);
        const before = target.before[id];
        const restored = before
          ? { ...before, mergedInto: before.mergedInto }
          : { ...current, status: "retired" as const };
        const { schemaVersion: _s, id: _i, version: _v, revisionId: _r, parentRevisionIds: _p, ...content } = restored;
        put(current, nextVersion(current, { ...content, mergedInto: restored.mergedInto }));
      }
      break;
    }
    case "add_chain": {
      for (const ref of [...request.chain.premiseRefs, request.chain.conclusionRef]) await requireKnownRevision(root, ref);
      const chains = await loadChains(root);
      const chain: KnowledgeChain = { id: `c-${randomUUID()}`, ...request.chain, revisionId: newRevision() };
      const next = validateChains([...chains, chain]);
      record.chainsBefore = (await readTextOptional(abs(root, CHAINS_FILE))) ?? "";
      record.chainsAfter = encodeJsonl(next);
      record.chainId = chain.id;
      break;
    }
    case "retire_chain": {
      const chains = await loadChains(root);
      const chain = chains.find((c) => c.id === request.chainId);
      if (!chain) throw new Error(`추론 사슬을 찾지 못했습니다: ${request.chainId}`);
      record.chainsBefore = (await readTextOptional(abs(root, CHAINS_FILE))) ?? "";
      record.chainsAfter = encodeJsonl(chains.map((c) => (c.id === chain.id ? { ...c, retired: true } : c)));
      record.chainId = chain.id;
      break;
    }
    default:
      throw new Error(`지원하지 않는 작업입니다: ${(request as { operation: string }).operation}`);
  }
  return record;
}

async function requireKnownRevision(root: string, ref: KnowledgeRef): Promise<void> {
  const item = await loadItem(root, ref.id);
  if (!item) throw new Error(`지식을 찾지 못했습니다: ${ref.id}`);
  if (item.revisionId === ref.revisionId) return;
  if (!(await loadHistory(root, ref.id)).some((entry) => entry.revisionId === ref.revisionId))
    throw new Error(`지식 버전을 찾지 못했습니다: ${ref.id}@${ref.revisionId}`);
}

export async function loadRecord(root: string, changeId: string): Promise<ChangeRecord | null> {
  if (!CHANGE_ID.test(changeId)) throw new Error(`changeId 형식이 올바르지 않습니다: ${changeId}`);
  const content = await readTextOptional(abs(root, changePath(changeId)));
  return content === null ? null : JSON.parse(content);
}

async function findMergeRecord(root: string, sourceId: string, targetId: string): Promise<ChangeRecord | null> {
  const history = await loadHistory(root, sourceId);
  for (const entry of [...history].reverse()) {
    if (entry.operation !== "merge") continue;
    const record = await loadRecord(root, entry.changeId);
    if (record?.mergeAdded?.targetId === targetId) return record;
  }
  return null;
}

function operationOf(request: KnowledgeChangeRequest): KnowledgeOperation {
  if (request.operation === "undo") return "revise";
  if (request.operation === "add_chain" || request.operation === "retire_chain") return "revise";
  return request.operation;
}

/**
 * Validate and apply one knowledge change atomically: item files, append-only
 * history, change record (for idempotent retry and undo) and chains together.
 */
export async function applyKnowledgeChange(
  root: string,
  request: KnowledgeChangeRequest,
  options: ApplyOptions = {},
): Promise<KnowledgeChangeResult> {
  if (!request || !CHANGE_ID.test(request.changeId ?? "")) throw new Error("changeId가 필요합니다.");
  if (typeof request.reason !== "string" || !request.reason.trim()) throw new Error("reason(변경 이유)이 필요합니다.");
  const payloadSha256 = sha256(JSON.stringify(request));
  const existing = await loadRecord(root, request.changeId);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256)
      throw new Error(`같은 changeId로 다른 변경을 적용할 수 없습니다: ${request.changeId}`);
    return { status: "already_applied", changeId: request.changeId, items: Object.values(existing.after), summary: summarize(existing) };
  }
  const at = (options.now ?? (() => new Date().toISOString()))();
  const record = await computeRecord(root, request, at, payloadSha256);
  const changes: PlannedChange[] = [];
  for (const [id, item] of Object.entries(record.after)) {
    changes.push({ path: itemPath(id), after: encodeKnowledgeItem(item) });
    const history = (await readTextOptional(abs(root, historyPath(id)))) ?? "";
    changes.push({
      path: historyPath(id),
      after: `${history}${JSON.stringify({ changeId: record.changeId, revisionId: item.revisionId, parentRevisionIds: item.parentRevisionIds, operation: operationOf(request), reason: record.reason, at, snapshot: item })}\n`,
    });
  }
  if (record.chainsAfter !== undefined) changes.push({ path: CHAINS_FILE, after: record.chainsAfter });
  changes.push({ path: changePath(record.changeId), after: `${JSON.stringify(record, null, 2)}\n` });
  if (options.extraChanges) changes.push(...(await options.extraChanges(record)));
  const plan = await preparePlan(root, `knowledge-${record.changeId}`, changes);
  // Optimistic concurrency: the plan captured each file's hash; executePlan
  // refuses to write if any of them changed in between.
  await executePlan(root, plan);
  return {
    status: "committed",
    changeId: record.changeId,
    items: Object.values(record.after),
    ...(record.chainsAfter !== undefined ? { chains: await loadChains(root) } : {}),
    summary: summarize(record),
  };
}

export function summarize(record: ChangeRecord): string {
  const items = Object.values(record.after).map((item) => `${item.name}(${item.id.slice(0, 10)}@v${item.version})`);
  return `${record.operation}: ${items.join(", ") || record.chainId || "-"} — ${record.reason}`;
}
