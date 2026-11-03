import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { validateConceptId, validateConceptNode, type ConceptNode } from "./book-types.ts";

export const CONCEPTS_DIR = "knowledge/concepts";
export const CONCEPT_HISTORY_DIR = "knowledge/concepts/history";
export const CONCEPT_CHANGES_DIR = "knowledge/concepts/changes";
const CHANGE_ID = /^[A-Za-z0-9_.-]{1,80}$/;

export const conceptPath = (id: string) => `${CONCEPTS_DIR}/${validateConceptId(id)}.json`;
export const conceptHistoryPath = (id: string) => `${CONCEPT_HISTORY_DIR}/${validateConceptId(id)}.jsonl`;
export function conceptChangePath(changeId: string): string {
  if (!CHANGE_ID.test(changeId)) throw new Error(`changeId 형식이 올바르지 않습니다: ${changeId}`);
  return `${CONCEPT_CHANGES_DIR}/${changeId}.json`;
}

export function abs(root: string, relative: string): string {
  return join(root, ...relative.split("/"));
}

export function encodeConcept(node: ConceptNode): string {
  return `${JSON.stringify(validateConceptNode(node), null, 2)}\n`;
}

export function decodeConcept(content: string, label: string): ConceptNode {
  try {
    return validateConceptNode(JSON.parse(content));
  } catch (error) {
    throw new Error(`개념 파일 손상: ${label} (${error instanceof Error ? error.message : error})`);
  }
}

/** All nodes including retired ones. Corrupt files throw; nothing is repaired. */
export async function loadConcepts(root: string): Promise<ConceptNode[]> {
  let names: string[];
  try {
    names = (await readdir(abs(root, CONCEPTS_DIR))).filter((n) => n.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const nodes: ConceptNode[] = [];
  for (const name of names) {
    const relative = `${CONCEPTS_DIR}/${name}`;
    const node = decodeConcept((await readTextOptional(abs(root, relative)))!, relative);
    if (`${node.id}.json` !== name) throw new Error(`파일 이름과 개념 ID가 다릅니다: ${relative}`);
    nodes.push(node);
  }
  return nodes;
}
