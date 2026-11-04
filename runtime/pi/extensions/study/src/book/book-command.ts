import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { findWorkspaceRoot, requireWorkspace } from "../workspace/workspace-root.ts";
import { loadConcepts } from "./book-store.ts";
import { activeById, ancestorsOf, pagePaths } from "./book-tree.ts";
import { outputPath } from "./site-build.ts";
import { SITE_DIR, writeBookSite } from "./site-write.ts";

type Match = { name: string; path: string; label: string; aliases: string[] };

async function concepts(root: string): Promise<Match[]> {
  const nodes = await loadConcepts(root);
  const byId = activeById(nodes);
  const paths = pagePaths(nodes);
  return [...byId.values()].map((n) => ({
    name: n.name,
    path: paths.get(n.id)!,
    label: [...ancestorsOf(byId, n).map((a) => a.name), n.name].join(" › "),
    aliases: n.aliases,
  }));
}

function matches(query: string, c: Match): boolean {
  const q = query.toLowerCase();
  return c.name.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q));
}

export async function bookCompletions(cwd: string, prefix: string) {
  const workspace = await findWorkspaceRoot(cwd).catch(() => null);
  if (!workspace) return null;
  const list = (await concepts(workspace.root).catch(() => [])).filter((c) => !prefix.trim() || matches(prefix.trim(), c));
  return list.slice(0, 40).map((c) => ({ value: c.name, label: c.name, description: c.label }));
}

/** Rebuild the PC-local site, then open the dashboard or the best-matching concept page as a file URL. */
export async function openBook(cwd: string, args: string, open: (url: string) => void): Promise<{ url: string; warnings: string[] }> {
  const workspace = await requireWorkspace(cwd);
  const built = await writeBookSite(workspace.root);
  const query = args.trim();
  let output = "index.html";
  if (query) {
    const list = await concepts(workspace.root);
    const exact = list.find((c) => c.name === query) ?? list.find((c) => c.name.toLowerCase() === query.toLowerCase());
    const found = exact ?? list.find((c) => matches(query, c));
    if (!found) throw new Error(`개념을 찾지 못했습니다: ${query}`);
    output = outputPath(found.path);
  }
  const url = pathToFileURL(join(workspace.root, ...SITE_DIR.split("/"), ...output.split("/"))).href;
  open(url);
  return { url, warnings: built.warnings };
}

export function registerBookCommand(pi: ExtensionAPI, deps: { openBrowser: (url: string) => void }): void {
  let completionCwd = process.cwd();
  pi.on?.("session_start", (_event, ctx) => {
    if (ctx?.cwd) completionCwd = ctx.cwd;
  });
  pi.registerCommand("study-book", {
    description: "내 교과서를 브라우저로 열기 — 개념 이름을 입력하면 그 페이지로",
    getArgumentCompletions: (prefix: string) => bookCompletions(completionCwd, prefix),
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      completionCwd = ctx.cwd;
      try {
        const { url, warnings } = await openBook(ctx.cwd, args, deps.openBrowser);
        ctx.ui.notify([`내 교과서: ${url}`, ...warnings.slice(0, 3).map((w) => `- ${w}`)].join("\n"), warnings.length ? "warning" : "info");
      } catch (error) {
        ctx.ui.notify(`교과서를 열지 못했습니다: ${error instanceof Error ? error.message : String(error)}`, "warning");
      }
    },
  });
}
