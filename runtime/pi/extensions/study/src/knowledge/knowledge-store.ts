import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { decodeKnowledgeItem } from "./knowledge-codec.ts";
import type { KnowledgeChain, KnowledgeHistoryEntry, KnowledgeItem } from "./knowledge-types.ts";
import { validateChains, validateKnowledgeId } from "./knowledge-validation.ts";

export const ITEMS_DIR = "knowledge/items";
export const HISTORY_DIR = "knowledge/history";
export const CHANGES_DIR = "knowledge/changes";
export const CHAINS_FILE = "knowledge/chains.jsonl";

export const itemPath = (id: string) => `${ITEMS_DIR}/${validateKnowledgeId(id)}.md`;
export const historyPath = (id: string) => `${HISTORY_DIR}/${validateKnowledgeId(id)}.jsonl`;
export const changePath = (changeId: string) => `${CHANGES_DIR}/${changeId}.json`;

export function abs(root: string, relative: string): string {
  return join(root, ...relative.split("/"));
}

export async function loadItem(root: string, id: string): Promise<KnowledgeItem | null> {
  const content = await readTextOptional(abs(root, itemPath(id)));
  return content === null ? null : decodeKnowledgeItem(content);
}

export async function requireItem(root: string, id: string): Promise<KnowledgeItem> {
  const item = await loadItem(root, id);
  if (!item) throw new Error(`지식을 찾지 못했습니다: ${id}`);
  return item;
}

export async function listItemIds(root: string): Promise<string[]> {
  try {
    return (await readdir(abs(root, ITEMS_DIR)))
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -3))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function loadAllItems(root: string): Promise<KnowledgeItem[]> {
  const items: KnowledgeItem[] = [];
  for (const id of await listItemIds(root)) items.push(await requireItem(root, id));
  return items;
}

function parseJsonl<T>(content: string | null, label: string): T[] {
  if (!content) return [];
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        throw new Error(`${label} ${index + 1}번째 줄이 손상됐습니다.`);
      }
    });
}

export async function loadHistory(root: string, id: string): Promise<KnowledgeHistoryEntry[]> {
  return parseJsonl(await readTextOptional(abs(root, historyPath(id))), historyPath(id));
}

/** Past version lookup for evidence recorded against an older revision. */
export async function itemAtRevision(
  root: string,
  id: string,
  revisionId: string,
): Promise<KnowledgeItem | null> {
  return (await loadHistory(root, id)).find((entry) => entry.revisionId === revisionId)?.snapshot ?? null;
}

export async function loadChains(root: string): Promise<KnowledgeChain[]> {
  return validateChains(parseJsonl(await readTextOptional(abs(root, CHAINS_FILE)), CHAINS_FILE));
}

export function encodeJsonl(values: unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join("\n") + (values.length ? "\n" : "");
}

/** Follow `mergedInto` to the canonical item, rejecting cycles. */
export async function resolveCanonical(root: string, id: string): Promise<string> {
  const seen = new Set<string>();
  let current = id;
  while (true) {
    if (seen.has(current)) throw new Error(`병합 연결이 순환합니다: ${[...seen].join(" → ")}`);
    seen.add(current);
    const item = await requireItem(root, current);
    if (!item.mergedInto) return current;
    current = item.mergedInto;
  }
}
