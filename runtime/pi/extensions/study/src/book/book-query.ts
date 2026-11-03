import { loadAllItems } from "../knowledge/knowledge-store.ts";
import { loadBinding } from "../knowledge/chapter-bindings.ts";
import { loadConcepts } from "./book-store.ts";
import { activeById, childrenOf, pagePath } from "./book-tree.ts";
import type { ConceptNode } from "./book-types.ts";

export type TreeLine = { id: string; name: string; depth: number; owner: ConceptNode["owner"]; revisionId: string; path: string; members: number; chapters: number };

export async function bookTree(root: string): Promise<TreeLine[]> {
  const byId = activeById(await loadConcepts(root));
  const lines: TreeLine[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const node of childrenOf(byId, parent)) {
      lines.push({ id: node.id, name: node.name, depth, owner: node.owner, revisionId: node.revisionId, path: pagePath(byId, node), members: node.members.length, chapters: node.learnedIn.length });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines;
}

export function formatTree(lines: TreeLine[]): string {
  if (!lines.length) return "교과서 개념이 아직 없습니다. 사용자가 /study-concepts로 최상위 영역을 먼저 만듭니다.";
  return lines.map((l) => `${"  ".repeat(l.depth)}- ${l.name}${l.owner === "user" ? " [사용자]" : ""} · 지식 ${l.members} · 챕터 ${l.chapters} (${l.id}@${l.revisionId})`).join("\n");
}

export type BookPlan = {
  pages: Array<{ conceptId: string; name: string; path: string; revisionId: string; knowledge: Array<{ id: string; name: string }> }>;
  unplaced: Array<{ id: string; name: string }>;
  tree: string;
};

/** Where this chapter's propositions already live, and which have no page yet. */
export async function planChapter(root: string, projectSlug: string, chapterSlug: string): Promise<BookPlan> {
  const binding = await loadBinding(root, projectSlug, chapterSlug);
  const ids = [...new Set((binding?.regions ?? []).flatMap((r) => r.refs.map((ref) => ref.id)))];
  const names = new Map((await loadAllItems(root)).map((item) => [item.id, item.name]));
  const byId = activeById(await loadConcepts(root));
  const owner = new Map<string, ConceptNode>();
  for (const node of byId.values()) for (const m of node.members) owner.set(m, node);
  const pages = new Map<string, BookPlan["pages"][number]>();
  const unplaced: BookPlan["unplaced"] = [];
  for (const id of ids) {
    const node = owner.get(id);
    const entry = { id, name: names.get(id) ?? id };
    if (!node) {
      unplaced.push(entry);
      continue;
    }
    if (!pages.has(node.id)) pages.set(node.id, { conceptId: node.id, name: node.name, path: pagePath(byId, node), revisionId: node.revisionId, knowledge: [] });
    pages.get(node.id)!.knowledge.push(entry);
  }
  return { pages: [...pages.values()], unplaced, tree: formatTree(await bookTree(root)) };
}
