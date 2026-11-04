import { posix } from "node:path";
import { escapeHtml } from "./highlight.ts";
import { renderMarkdown, type TocEntry } from "./md-html.ts";
import { collectLinks, parseMarkdown } from "./md-parse.ts";

/** Pure inputs: a reader (root-relative paths), the book files and the concept tree. */
export type SiteSource = {
  read: (path: string) => Promise<string | null>;
  bookFiles: string[];
  tree: Array<{ id: string; name: string; depth: number; path: string }>;
  /** Change ids that have a comparison page under `_changes/`. */
  changes?: Set<string>;
};
/** `files`: root-relative binary files (images) to copy under `_files/`. */
export type Site = { pages: Map<string, string>; searchIndex: string; warnings: string[]; files: string[] };
const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
const SOURCE_DIR = "_src";
const FORBIDDEN = /(^|\/)(\.study|review|node_modules|build|\.git)(\/|$)/;

/** book/a/README.md → a/index.html; book/a/b.md → a/b.html; other md → _src/<path>.html */
export function outputPath(source: string): string {
  if (source.startsWith("book/")) {
    const rel = source.slice("book/".length);
    return rel === "README.md" ? "index.html" : rel.endsWith("/README.md") ? `${rel.slice(0, -"README.md".length)}index.html` : rel.replace(/\.md$/, ".html");
  }
  return `${SOURCE_DIR}/${source.replace(/\.md$/, ".html")}`;
}

function decode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function encodePath(path: string): string {
  return path.split("/").map((p) => (p === ".." || p === "." ? p : encodeURIComponent(p))).join("/");
}

/** Resolve a relative markdown link from one root-relative file; null when it leaves the root. */
function resolveLink(from: string, href: string): { target: string; hash: string } | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return null;
  const [path, ...rest] = href.split("#");
  const hash = rest.length ? `#${rest.join("#")}` : "";
  const target = posix.normalize(posix.join(posix.dirname(from), decode(path)));
  if (target.startsWith("../") || target === "..") return null;
  return { target, hash };
}

function relativeUrl(fromOutput: string, toOutput: string): string {
  const rel = posix.relative(posix.dirname(fromOutput), toOutput) || posix.basename(toOutput);
  return encodePath(rel);
}

function layout(args: { output: string; title: string; body: string; toc: TocEntry[]; tree: SiteSource["tree"]; mermaid: boolean; currentBook?: string }): string {
  const asset = (name: string) => relativeUrl(args.output, `_assets/${name}`);
  const nav = args.tree
    .map((n) => {
      const out = outputPath(n.path);
      const current = out === args.output ? ' aria-current="page"' : "";
      return `<li class="d${Math.min(n.depth, 5)}"><a href="${relativeUrl(args.output, out)}"${current}>${escapeHtml(n.name)}</a></li>`;
    })
    .join("");
  const toc = args.toc.filter((t) => t.level >= 2 && t.level <= 3);
  const onThisPage = toc.length
    ? `<nav class="toc" aria-label="이 페이지"><p>이 페이지</p><ul>${toc.map((t) => `<li class="l${t.level}"><a href="#${escapeHtml(encodeURIComponent(t.id))}">${escapeHtml(t.text)}</a></li>`).join("")}</ul></nav>`
    : "";
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(args.title)} · 내 교과서</title>
<link rel="stylesheet" href="${asset("book.css")}">
${args.mermaid ? `<script src="${asset("mermaid.min.js")}" defer></script>\n` : ""}<script src="${asset("book.js")}" defer></script>
</head>
<body data-root="${relativeUrl(args.output, "index.html").replace(/index\.html$/, "")}">
<header class="top"><a class="home" href="${relativeUrl(args.output, "index.html")}">내 교과서</a><input id="search" type="search" placeholder="개념 검색" aria-label="개념 검색" autocomplete="off"><ul id="search-results" hidden></ul></header>
<div class="layout">
<nav class="tree" aria-label="개념 위계"><ul>${nav}</ul></nav>
<main>${args.body}</main>
${onThisPage}
</div>
</body>
</html>
`;
}

/** Dashboard "최근 교과서 변경" lines `- <date> · <changeId> · <reason>`: make the id a link. */
function linkChanges(blocks: ReturnType<typeof parseMarkdown>, changes: Set<string>): void {
  for (const block of blocks) {
    if (block.type !== "list") continue;
    for (const item of block.items) {
      const para = item.children[0];
      if (para?.type !== "paragraph" || para.text.length !== 1 || para.text[0].type !== "text") continue;
      const m = /^(\d{4}-\d\d-\d\d · )([A-Za-z0-9_.-]+)( · [\s\S]*)$/.exec(para.text[0].value);
      if (!m || !changes.has(m[2])) continue;
      para.text = [
        { type: "text", value: m[1] },
        { type: "link", href: `_changes/${m[2]}.html`, children: [{ type: "text", value: m[2] }] },
        { type: "text", value: m[3] },
      ];
    }
  }
}

/** Book pages plus the out-of-book markdown they link to (one level deep). */
export async function buildSite(source: SiteSource): Promise<Site> {
  const pages = new Map<string, string>();
  const warnings: string[] = [];
  const index: Array<{ url: string; title: string; headings: string[] }> = [];
  const files = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = source.bookFiles.filter((p) => p.endsWith(".md")).sort().map((path) => ({ path, depth: 0 }));
  const seen = new Set(queue.map((q) => q.path));

  const cache = new Map<string, string | null>();
  const read = async (p: string) => {
    if (!cache.has(p)) cache.set(p, await source.read(p));
    return cache.get(p)!;
  };

  while (queue.length) {
    const { path, depth } = queue.shift()!;
    const content = await read(path);
    if (content === null) {
      warnings.push(`읽지 못한 페이지: ${path}`);
      continue;
    }
    // Resolve every link target first (existence needs I/O); rendering stays synchronous.
    const targets = new Map<string, string>();
    const blocks = parseMarkdown(content);
    for (const href of collectLinks(blocks)) {
      const link = resolveLink(path, href);
      if (!link || FORBIDDEN.test(link.target) || !link.target.endsWith(".md")) continue;
      const inBook = link.target.startsWith("book/");
      if (!inBook && depth >= 2) continue;
      if ((await read(link.target)) === null) {
        warnings.push(`깨진 링크: ${path} → ${link.target}`);
        continue;
      }
      targets.set(link.target, outputPath(link.target));
      if (!seen.has(link.target)) {
        seen.add(link.target);
        queue.push({ path: link.target, depth: inBook ? 0 : depth + 1 });
      }
    }
    const output = outputPath(path);
    if (path === "book/README.md" && source.changes?.size) linkChanges(blocks, source.changes);
    const rendered = renderMarkdown(blocks, {
      rewriteImage: (src) => {
        const link = resolveLink(path, src);
        if (!link || FORBIDDEN.test(link.target) || !IMAGE.test(link.target)) return null;
        files.add(link.target);
        return relativeUrl(output, `_files/${link.target}`);
      },
      rewriteLink: (href) => {
        if (href.startsWith("_changes/")) return href;
        const link = resolveLink(path, href);
        if (!link) return href;
        // Study records are never published, whatever their extension.
        if (FORBIDDEN.test(link.target)) return "";
        if (!link.target.endsWith(".md")) return href;
        const out = targets.get(link.target);
        if (out) return `${relativeUrl(output, out)}${link.hash}`;
        const inBook = link.target.startsWith("book/");
        return !inBook && depth >= 2 ? href : "";
      },
    });
    const title = rendered.title ?? posix.basename(posix.dirname(path));
    pages.set(output, layout({ output, title, body: rendered.html, toc: rendered.toc, tree: source.tree, mermaid: rendered.mermaid > 0 }));
    if (path.startsWith("book/")) index.push({ url: output, title, headings: rendered.toc.filter((t) => t.level >= 2).map((t) => t.text) });
  }
  return { pages, searchIndex: JSON.stringify(index), warnings, files: [...files].sort() };
}
