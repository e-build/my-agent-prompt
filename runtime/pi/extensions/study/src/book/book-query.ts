import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { loadAllItems } from "../knowledge/knowledge-store.ts";
import { loadBinding, projectBySlug } from "../knowledge/chapter-bindings.ts";
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

export type BookMaterials = {
  readme: string;
  lab: string[];
  questions: Array<{ id: string; purpose: string; path: string }>;
  tests: string[];
};

export type BookPlan = {
  projectId: string;
  materials: BookMaterials;
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
  const project = await projectBySlug(root, projectSlug);
  return {
    projectId: project.id,
    materials: await chapterMaterials(root, project.path, chapterSlug),
    pages: [...pages.values()],
    unplaced,
    tree: formatTree(await bookTree(root)),
  };
}

async function jsonFiles(root: string, dir: string): Promise<Array<{ path: string; value: any }>> {
  let names: string[];
  try {
    names = (await readdir(join(root, ...dir.split("/")))).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const files: Array<{ path: string; value: any }> = [];
  for (const name of names) {
    try {
      files.push({ path: `${dir}/${name}`, value: JSON.parse((await readTextOptional(join(root, ...dir.split("/"), name)))!) });
    } catch {
      /* unreadable records are not materials */
    }
  }
  return files;
}

/** Paths and ids only: the agent reads what it needs; answers never leave their files. */
async function chapterMaterials(root: string, projectPath: string, chapterSlug: string): Promise<BookMaterials> {
  const chapter = `${projectPath}/${chapterSlug}`;
  const lab = [];
  for (const name of ["README.md", "results.md"]) {
    const path = `${chapter}/lab/${name}`;
    if ((await readTextOptional(join(root, ...path.split("/")))) !== null) lab.push(path);
  }
  const questions = (await jsonFiles(root, `${projectPath}/.study/dialogue/questions`))
    .filter((f) => f.value?.context?.chapterSlug === chapterSlug)
    .map((f) => ({ id: String(f.value.id), purpose: String(f.value.purpose), path: f.path }));
  const tests = (await jsonFiles(root, `${projectPath}/.study/assessments`))
    .filter((f) => f.value?.kind === "test" && f.value?.questionSet?.chapterSlug === chapterSlug && f.value?.grade?.passed === true)
    .map((f) => f.path);
  return { readme: `${chapter}/README.md`, lab, questions, tests };
}
