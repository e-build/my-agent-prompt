import { copyFile, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { safeWorkspacePath } from "../workspace/safe-path.ts";
import { bookTree } from "./book-query.ts";
import { renderChangePage } from "./book-diff.ts";
import { abs, CONCEPT_CHANGES_DIR } from "./book-store.ts";
import { BOOK_DIR } from "./book-tree.ts";
import { buildSite } from "./site-build.ts";

/** PC-local and regenerable: never committed, safe to delete. */
export const SITE_DIR = ".study/local/book-site";
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "book");
const ASSET_FILES: Array<[string, string]> = [
  ["book.css", "book.css"],
  ["book.js", "book.js"],
  ["vendor/mermaid.min.js", "mermaid.min.js"],
  ["vendor/mermaid.LICENSE", "mermaid.LICENSE"],
];

async function markdownFiles(root: string, dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(abs(root, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await markdownFiles(root, rel)));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(rel);
  }
  return files;
}

async function changeRecords(root: string): Promise<Array<{ changeId: string; reason: string; at: string; files: Array<{ path: string; before: string | null; after: string | null }> }>> {
  let names: string[];
  try {
    names = (await readdir(abs(root, CONCEPT_CHANGES_DIR))).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const records = [];
  for (const name of names) {
    try {
      const r = JSON.parse((await readTextOptional(join(abs(root, CONCEPT_CHANGES_DIR), name)))!);
      if (typeof r.changeId === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(r.changeId) && Array.isArray(r.files)) records.push(r);
    } catch {
      /* unreadable record: no comparison page */
    }
  }
  return records;
}

export type SiteWriteResult = { dir: string; pages: number; warnings: string[] };

/**
 * Build into a sibling temp directory, then swap it in, so a failed build
 * never leaves a half-written site and stale pages disappear.
 */
export async function writeBookSite(root: string): Promise<SiteWriteResult> {
  const changes = await changeRecords(root);
  const tree = (await bookTree(root)).map((l) => ({ id: l.id, name: l.name, depth: l.depth, path: l.path }));
  const site = await buildSite({
    read: (path) => readTextOptional(abs(root, path)),
    bookFiles: await markdownFiles(root, BOOK_DIR),
    tree,
    changes: new Set(changes.map((c) => c.changeId)),
  });
  const target = await safeWorkspacePath(root, SITE_DIR);
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await rm(temp, { recursive: true, force: true });
  for (const [output, html] of site.pages) {
    const file = join(temp, ...posix.normalize(output).split("/"));
    if (!file.startsWith(temp)) throw new Error(`사이트 밖 경로입니다: ${output}`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html, "utf8");
  }
  await mkdir(join(temp, "_changes"), { recursive: true });
  for (const change of changes) await writeFile(join(temp, "_changes", `${change.changeId}.html`), renderChangePage(change), "utf8");
  await mkdir(join(temp, "_assets"), { recursive: true });
  for (const [from, to] of ASSET_FILES) await copyFile(join(ASSETS, ...from.split("/")), join(temp, "_assets", to));
  await writeFile(join(temp, "_assets", "search-index.js"), `window.__BOOK_INDEX__ = ${site.searchIndex};\n`, "utf8");
  const old = `${target}.old-${process.pid}-${Date.now()}`;
  await mkdir(dirname(target), { recursive: true });
  await rename(target, old).catch(() => {});
  await rename(temp, target);
  await rm(old, { recursive: true, force: true });
  return { dir: target, pages: site.pages.size, warnings: site.warnings };
}
