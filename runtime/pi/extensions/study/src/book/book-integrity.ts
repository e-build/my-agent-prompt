import { readdir } from "node:fs/promises";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { loadItem } from "../knowledge/knowledge-store.ts";
import { parsePage } from "./book-page.ts";
import { abs, CONCEPTS_DIR, decodeConcept } from "./book-store.ts";
import { assertTree, pagePaths } from "./book-tree.ts";
import type { ConceptNode } from "./book-types.ts";

const CONFLICT = /^(<{7}|={7}|>{7})( |$)/m;

/** Read-only check run at session start. Never repairs. */
export async function checkBookIntegrity(root: string): Promise<string[]> {
  const issues: string[] = [];
  let names: string[] = [];
  try {
    names = (await readdir(abs(root, CONCEPTS_DIR))).filter((n) => n.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const nodes: ConceptNode[] = [];
  for (const name of names) {
    const relative = `${CONCEPTS_DIR}/${name}`;
    const content = (await readTextOptional(abs(root, relative)))!;
    if (CONFLICT.test(content)) {
      issues.push(`Git 충돌 표시가 남아 있습니다: ${relative}`);
      continue;
    }
    try {
      const node = decodeConcept(content, relative);
      if (`${node.id}.json` !== name) issues.push(`파일 이름과 개념 ID가 다릅니다: ${relative}`);
      nodes.push(node);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  try {
    assertTree(nodes);
  } catch (error) {
    issues.push(`교과서 개념 위계: ${error instanceof Error ? error.message : error}`);
  }
  for (const node of nodes.filter((n) => !n.retired)) {
    for (const id of node.members) {
      const item = await loadItem(root, id).catch(() => null);
      if (!item) issues.push(`교과서 개념이 없는 지식을 가리킵니다: ${node.name} → ${id}`);
      else if (item.mergedInto) issues.push(`교과서 개념에 병합된 지식이 남아 있습니다: ${node.name} → ${id} (→ ${item.mergedInto})`);
    }
  }
  let paths = new Map<string, string>();
  try {
    paths = pagePaths(nodes);
  } catch {
    return issues;
  }
  for (const [id, path] of paths) {
    const content = await readTextOptional(abs(root, path));
    if (content === null) {
      issues.push(`교과서 페이지가 없습니다: ${path}`);
      continue;
    }
    if (CONFLICT.test(content)) {
      issues.push(`Git 충돌 표시가 남아 있습니다: ${path}`);
      continue;
    }
    try {
      if (parsePage(content).conceptId !== id) issues.push(`교과서 페이지의 개념 ID가 다릅니다: ${path}`);
    } catch (error) {
      issues.push(`교과서 페이지 손상: ${path} (${error instanceof Error ? error.message : error})`);
    }
  }
  return issues;
}
