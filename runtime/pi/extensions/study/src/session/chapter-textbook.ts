import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { parsePage } from "../book/book-page.ts";
import { collectLinks, parseMarkdown } from "../book/md-parse.ts";

/** Chapter README section that links the book pages written during concept learning. */
export const TEXTBOOK_SECTION = "교과서 페이지";
const EMPTY_MAIN = "(아직 본문이 없습니다)";

export type LinkedPage = { path: string; exists: boolean; hasBody: boolean; body: string };

function section(readme: string): string {
  return readme.match(new RegExp(`##\\s*${TEXTBOOK_SECTION}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`))?.[1] ?? "";
}

/** Book pages the chapter README links under `## 교과서 페이지` (local `book/…/README.md` links only). */
export async function linkedTextbookPages(readmePath: string, readme: string): Promise<LinkedPage[]> {
  const seen = new Set<string>();
  const pages: LinkedPage[] = [];
  for (const href of collectLinks(parseMarkdown(section(readme)))) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
    let decoded = href.split("#")[0];
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* keep raw */
    }
    const path = resolve(dirname(readmePath), decoded).normalize("NFC");
    if (!path.endsWith(`${sep}README.md`) || !path.split(sep).includes("book") || seen.has(path)) continue;
    seen.add(path);
    let body = "";
    let exists = false;
    try {
      body = parsePage(await readFile(path, "utf8")).regions.main.body.trim();
      exists = true;
    } catch {
      /* missing or not a book page */
    }
    pages.push({ path, exists, hasBody: exists && !!body && body !== EMPTY_MAIN, body });
  }
  return pages;
}

/** What a concept page is missing by the textbook design. Advice only: never blocks completion. */
export function textbookWarnings(body: string): string[] {
  const warnings: string[] = [];
  if (!/^#{2,4}\s*.*(내부 동작|어떻게 동작)/m.test(body)) warnings.push("내부 동작 섹션이 없습니다");
  if (!/!\[[^\]]*\]\([^)\s]+\.svg(?:[)\s"])/.test(body)) warnings.push("SVG 그림이 없습니다");
  if (!/\]\(https?:\/\//.test(body)) warnings.push("출처(웹 링크)가 없습니다");
  return warnings;
}
