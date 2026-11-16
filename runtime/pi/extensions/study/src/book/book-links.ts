import { posix } from "node:path";
import { collectLinks, parseMarkdown } from "./md-parse.ts";
import { BOOK_DIR } from "./book-tree.ts";

function decode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Local links and images in a page body that resolve outside book/.
 * The textbook body depends only on book/ content; web links (scheme), anchors
 * and absolute paths are not local files and are ignored here.
 */
export function outsideBookTargets(pagePath: string, body: string): string[] {
  const out: string[] = [];
  for (const href of collectLinks(parseMarkdown(body))) {
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) continue;
    const target = posix.normalize(posix.join(posix.dirname(pagePath), decode(href.split("#")[0])));
    if (target !== BOOK_DIR && !target.startsWith(`${BOOK_DIR}/`)) out.push(target);
  }
  return [...new Set(out)];
}
