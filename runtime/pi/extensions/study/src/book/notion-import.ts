import { posix } from "node:path";
import { notionToMarkdown } from "./notion-md.ts";

/** One fetched Notion page (MCP `fetch`): id, title, last edit and the inner `<content>` text. */
export type NotionPage = { id: string; title: string; lastEdited: string | null; content: string };
export type ImportFile = { path: string; content: string; notionId: string | null };
export type ImportPlan = {
  files: ImportFile[];
  images: Array<{ ref: string; path: string; page: string }>;
  empty: string[];
  orphans: string[];
  databases: Array<{ title: string; dataSource: string; page: string }>;
  warnings: string[];
};

export const NOTION_SOURCES = "sources/notion";
const PAGE_URL = /<page url="https:\/\/app\.notion\.com\/p\/([0-9a-f]{32})"[^>]*>\n?([\s\S]*?)\n?<\/page>/g;

function clean(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\\(.)/g, "$1")
    .trim();
}

/** File/dir name: NFC, no path characters, short enough for any file system. */
function safeName(title: string): string {
  const name = clean(title)
    .normalize("NFC")
    .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
  return name || "제목 없음";
}

function relativeLink(from: string, to: string): string {
  return posix.relative(posix.dirname(from), to).split("/").map((p) => (p === ".." ? p : encodeURIComponent(p))).join("/");
}

/**
 * Lay out a Notion page tree as markdown files. Sections (`#`, `###`) of the
 * root page become directories; each child page becomes `<title>.md`, and its
 * own sub pages go in a directory named after it. Pure: no I/O.
 */
export function planNotionImport(pages: NotionPage[], options: { rootId: string }): ImportPlan {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const root = byId.get(options.rootId);
  if (!root) throw new Error(`루트 페이지가 없습니다: ${options.rootId}`);
  const dirOf = new Map<string, string>();
  const placed: string[] = [];
  const index: string[] = [`# ${clean(root.title).replace(/^\p{Extended_Pictographic}\s*/u, "")}`, "", `노션에서 옮긴 원문입니다. 원본: https://app.notion.com/p/${root.id}`, ""];
  const indexPath = `${NOTION_SOURCES}/README.md`;
  const indexLinks: Array<{ at: number; id: string }> = [];
  const databases: ImportPlan["databases"] = [];

  // 1. Root sections → directories, in document order.
  let section: string[] = [];
  for (const line of root.content.split("\n")) {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line.trim());
    if (heading) {
      const name = safeName(heading[2]);
      section = heading[1].length === 1 ? [name] : [section[0] ?? "기타", name];
      index.push(`${heading[1].length === 1 ? "##" : "###"} ${name}`, "");
      continue;
    }
    for (const m of line.matchAll(/<page url="https:\/\/app\.notion\.com\/p\/([0-9a-f]{32})"/g)) {
      if (dirOf.has(m[1])) continue;
      dirOf.set(m[1], [NOTION_SOURCES, ...section].join("/"));
      placed.push(m[1]);
      indexLinks.push({ at: index.length, id: m[1] });
      index.push("");
    }
    const db = /<database\b[^>]*data-source-url="([^"]*)"[^>]*>([\s\S]*?)<\/database>/.exec(line);
    if (db) {
      databases.push({ title: clean(db[2]) || "제목 없음", dataSource: db[1], page: root.id });
      index.push(`> 노션 데이터베이스: ${clean(db[2]) || "제목 없음"} (${db[1]})`, "");
    }
  }
  // Plain list items under a section (titles without pages) stay in the index.
  // 2. Sub pages → a directory named after their parent page, breadth-first.
  const pathOf = new Map<string, string>();
  const taken = new Set<string>();
  const titleCount = new Map<string, number>();
  for (const p of pages) titleCount.set(safeName(p.title), (titleCount.get(safeName(p.title)) ?? 0) + 1);
  const fileName = (p: NotionPage) => {
    const base = safeName(p.title);
    return (titleCount.get(base) ?? 0) > 1 ? `${base}-${p.id.slice(-8)}` : base;
  };
  const queue = [...placed];
  while (queue.length) {
    const pid = queue.shift()!;
    const page = byId.get(pid);
    if (!page || pathOf.has(pid)) continue;
    let path = `${dirOf.get(pid)}/${fileName(page)}.md`;
    if (taken.has(path.toLowerCase())) path = `${dirOf.get(pid)}/${fileName(page)}-${pid.slice(-8)}.md`;
    taken.add(path.toLowerCase());
    pathOf.set(pid, path);
    for (const m of page.content.matchAll(PAGE_URL)) {
      if (dirOf.has(m[1]) || !byId.has(m[1])) continue;
      dirOf.set(m[1], path.replace(/\.md$/, ""));
      queue.push(m[1]);
    }
  }
  const orphans = pages.filter((p) => p.id !== root.id && !pathOf.has(p.id)).map((p) => p.id);
  for (const id of orphans) {
    const page = byId.get(id)!;
    const path = `${NOTION_SOURCES}/_기타/${fileName(page)}.md`;
    pathOf.set(id, path);
  }

  // 3. Convert every page with links resolved against the final layout.
  const files: ImportFile[] = [];
  const images: ImportPlan["images"] = [];
  const empty: string[] = [];
  const warnings: string[] = [];
  for (const [pid, path] of pathOf) {
    const page = byId.get(pid)!;
    const mediaDir = `${posix.dirname(path)}/media`;
    const result = notionToMarkdown(page.content, {
      imagePath: (_ref, i) => `media/${pid}-${i}.png`,
      pageLink: (target) => (pathOf.has(target) ? relativeLink(path, pathOf.get(target)!) : null),
      pageTitle: (target) => (byId.has(target) ? clean(byId.get(target)!.title) : null),
    });
    for (const image of result.images) images.push({ ref: image.ref, path: `${mediaDir}/${posix.basename(image.path)}`, page: pid });
    for (const db of result.databases) databases.push({ ...db, page: pid });
    for (const w of result.warnings) warnings.push(`${clean(page.title)}: ${w}`);
    const body = result.markdown.trim();
    if (!body || body.replace(/^- \[[^\]]*\]\([^)]*\)$/gm, "").trim() === "") {
      if (!body) empty.push(pid);
    }
    const front = ["---", `notion: ${pid}`, `source: https://app.notion.com/p/${pid}`, ...(page.lastEdited ? [`edited: ${page.lastEdited.slice(0, 10)}`] : []), "---"];
    const text = body || "> 노션 원문이 비어 있습니다. 제목만 옮겼습니다.";
    files.push({ path, notionId: pid, content: `${front.join("\n")}\n# ${clean(page.title)}\n\n${text}\n` });
  }
  for (const link of indexLinks) {
    const target = pathOf.get(link.id);
    const page = byId.get(link.id);
    index[link.at] = target && page ? `- [${clean(page.title)}](${relativeLink(indexPath, target)})` : `- (가져오지 못한 페이지 ${link.id})`;
  }
  if (orphans.length) index.push("## 기타", "", ...orphans.map((id) => `- [${clean(byId.get(id)!.title)}](${relativeLink(indexPath, pathOf.get(id)!)})`), "");
  files.push({ path: indexPath, notionId: root.id, content: `${index.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n` });
  return { files, images, empty, orphans, databases, warnings };
}
