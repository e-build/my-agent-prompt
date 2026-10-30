/** Proposition-first knowledge contracts. Learner evidence is a separate type. */
export type KnowledgeStatus = "confirmed" | "uncertain" | "conflicted" | "retired";

export type SourceRef = {
  materialId: string;
  kind: "url" | "workspace-file" | "external-file" | "teacher";
  /** Relative file + section, or URL + anchor. */
  locator: string;
  observedAt: string;
  digest?: string;
  /** explicit: stated by the source; derived: interpretation; hypothesis: unverified. */
  basis: "explicit" | "derived" | "hypothesis";
};

export type KnowledgeRef = { id: string; version: number; revisionId: string };

export type KnowledgeItem = {
  schemaVersion: 1;
  /** `k-<uuid>`; short forms are display-only. */
  id: string;
  version: number;
  revisionId: string;
  parentRevisionIds: string[];
  name: string;
  statement: string;
  conditions: string[];
  scope: string;
  status: KnowledgeStatus;
  explanation: string;
  aliases: string[];
  sources: SourceRef[];
  mergedInto?: string;
};

/** Joint premises → conclusion. The premise set is order-independent. */
export type KnowledgeChain = {
  id: string;
  premiseRefs: KnowledgeRef[];
  conclusionRef: KnowledgeRef;
  sourceRefs: SourceRef[];
  revisionId: string;
  retired?: boolean;
};

export type KnowledgeHistoryEntry = {
  changeId: string;
  revisionId: string;
  parentRevisionIds: string[];
  operation: KnowledgeOperation;
  reason: string;
  at: string;
  snapshot: KnowledgeItem;
};

export type KnowledgeOperation =
  | "create"
  | "add_expression"
  | "revise"
  | "set_status"
  | "merge"
  | "unmerge";

export const KNOWLEDGE_STATUSES: KnowledgeStatus[] = ["confirmed", "uncertain", "conflicted", "retired"];
export const SOURCE_KINDS: SourceRef["kind"][] = ["url", "workspace-file", "external-file", "teacher"];
export const SOURCE_BASES: SourceRef["basis"][] = ["explicit", "derived", "hypothesis"];

export function shortKnowledgeId(id: string): string {
  return id.slice(0, 8);
}

export function refOf(item: KnowledgeItem): KnowledgeRef {
  return { id: item.id, version: item.version, revisionId: item.revisionId };
}

export function formatRef(ref: KnowledgeRef): string {
  return `${ref.id}@v${ref.version}`;
}
