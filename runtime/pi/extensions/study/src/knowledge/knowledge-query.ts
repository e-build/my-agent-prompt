import { loadAllItems, loadChains } from "./knowledge-store.ts";
import type { KnowledgeItem, KnowledgeStatus } from "./knowledge-types.ts";

/** Learner-safe view: no statement/explanation, so review answers are not revealed. */
export type KnowledgeSummary = {
  id: string;
  name: string;
  status: KnowledgeStatus;
  version: number;
  revisionId: string;
  mergedInto?: string;
};

export type KnowledgeQuery = {
  ids?: string[];
  text?: string;
  status?: KnowledgeStatus[];
  includeMerged?: boolean;
  detail?: "summary" | "full";
  limit?: number;
};

export function summarizeItem(item: KnowledgeItem): KnowledgeSummary {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    version: item.version,
    revisionId: item.revisionId,
    ...(item.mergedInto ? { mergedInto: item.mergedInto } : {}),
  };
}

function matches(item: KnowledgeItem, text: string): boolean {
  const needle = text.toLowerCase();
  return [item.name, item.statement, item.scope, ...item.aliases, ...item.conditions].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

/** Read-only search; `full` is for the agent's own comparison work. */
export async function queryKnowledge(root: string, query: KnowledgeQuery = {}) {
  const items = (await loadAllItems(root)).filter(
    (item) =>
      (query.includeMerged || !item.mergedInto) &&
      (!query.ids?.length || query.ids.includes(item.id)) &&
      (!query.status?.length || query.status.includes(item.status)) &&
      (!query.text || matches(item, query.text)),
  );
  const limited = items.slice(0, Math.max(1, Math.min(query.limit ?? 50, 500)));
  const ids = new Set(limited.map((item) => item.id));
  const chains = (await loadChains(root)).filter(
    (chain) => !chain.retired && (ids.has(chain.conclusionRef.id) || chain.premiseRefs.some((ref) => ids.has(ref.id))),
  );
  return {
    total: items.length,
    items: query.detail === "full" ? limited : limited.map(summarizeItem),
    chains,
  };
}
