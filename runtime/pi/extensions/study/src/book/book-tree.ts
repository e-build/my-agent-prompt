import { posix } from "node:path";
import type { ConceptNode } from "./book-types.ts";

export const BOOK_DIR = "book";

/** Pure tree rules: parents exist, no cycles, unique sibling names, one page per proposition. */
export function assertTree(nodes: ConceptNode[]): void {
  const active = new Map(nodes.filter((n) => !n.retired).map((n) => [n.id, n]));
  const siblings = new Set<string>();
  const memberOf = new Map<string, string>();
  for (const node of active.values()) {
    if (node.parentId !== null && !active.has(node.parentId))
      throw new Error(`상위 개념이 없습니다: ${node.name} → ${node.parentId}`);
    const seen = new Set<string>([node.id]);
    for (let p = node.parentId; p !== null; p = active.get(p)!.parentId) {
      if (seen.has(p)) throw new Error(`개념 위계가 순환합니다: ${node.name}`);
      seen.add(p);
    }
    // macOS file systems are case-insensitive: compare lower-cased names.
    const key = `${node.parentId}\u0000${node.name.toLowerCase()}`;
    if (siblings.has(key)) throw new Error(`같은 상위 개념 아래에 같은 이름이 있습니다: ${node.name}`);
    siblings.add(key);
    for (const member of node.members) {
      const other = memberOf.get(member);
      if (other && other !== node.id)
        throw new Error(`지식 ${member}이(가) 두 페이지에 속합니다: ${active.get(other)!.name}, ${node.name}`);
      memberOf.set(member, node.id);
    }
  }
}

export function activeById(nodes: ConceptNode[]): Map<string, ConceptNode> {
  return new Map(nodes.filter((n) => !n.retired).map((n) => [n.id, n]));
}

/** Root → parent (exclusive of the node). */
export function ancestorsOf(byId: Map<string, ConceptNode>, node: ConceptNode): ConceptNode[] {
  const chain: ConceptNode[] = [];
  for (let p = node.parentId; p !== null; p = byId.get(p)!.parentId) chain.unshift(byId.get(p)!);
  return chain;
}

export function childrenOf(byId: Map<string, ConceptNode>, id: string | null): ConceptNode[] {
  return [...byId.values()]
    .filter((n) => n.parentId === id)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ko"));
}

export function pagePath(byId: Map<string, ConceptNode>, node: ConceptNode): string {
  return [BOOK_DIR, ...ancestorsOf(byId, node).map((n) => n.name), node.name, "README.md"].join("/");
}

export function pagePaths(nodes: ConceptNode[]): Map<string, string> {
  const byId = activeById(nodes);
  return new Map([...byId.values()].map((n) => [n.id, pagePath(byId, n)]));
}

/** Markdown link target from one root-relative file to another. */
export function relativeLink(fromFile: string, toFile: string): string {
  return posix.relative(posix.dirname(fromFile), toFile).split("/").map(encodeURIComponent).join("/");
}
