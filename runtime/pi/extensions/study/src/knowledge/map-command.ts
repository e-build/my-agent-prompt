import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { KnowledgeMapStore } from "../bridge/knowledge-routes.ts";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { buildKnowledgeView, renderKnowledgeMap } from "./knowledge-view.ts";
import { findWorkspaceRoot } from "../workspace/workspace-root.ts";
import { loadAllItems } from "./knowledge-store.ts";

/** Complete knowledge names; the value is the ID used to focus the map. */
export async function mapCompletions(cwd: string, prefix: string) {
  if (/\s/.test(prefix)) return null;
  const workspace = await findWorkspaceRoot(cwd).catch(() => null);
  if (!workspace) return null;
  const items = (await loadAllItems(workspace.root).catch(() => []))
    .filter((item) => !item.mergedInto && (!prefix || item.name.includes(prefix) || item.id.startsWith(prefix)))
    .slice(0, 30)
    .map((item) => ({ value: item.id, label: item.name, description: `${item.status} · v${item.version} · 이 지식 주변만 보기` }));
  return items.length ? items : null;
}

/** Build a read-only snapshot and return its loopback URL. */
export async function openKnowledgeMap(
  cwd: string,
  args: string,
  deps: { store: KnowledgeMapStore; startServer: () => Promise<number>; openBrowser: (url: string) => void },
): Promise<string> {
  const workspace = await requireWorkspace(cwd);
  const focus = args.trim().split(/\s+/).filter(Boolean)[0];
  const view = await buildKnowledgeView(workspace.root, focus ? { focus } : {});
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  deps.store.put(id, renderKnowledgeMap(view));
  const url = `http://127.0.0.1:${await deps.startServer()}/knowledge/${id}`;
  deps.openBrowser(url);
  return url;
}

export function registerMapCommand(
  pi: ExtensionAPI,
  deps: { store: KnowledgeMapStore; startServer: () => Promise<number>; openBrowser: (url: string) => void },
): void {
  let completionCwd = process.cwd();
  pi.on?.("session_start", (_event, ctx) => {
    if (ctx?.cwd) completionCwd = ctx.cwd;
  });
  pi.registerCommand("study-map", {
    description: "지식 지도를 브라우저로 열기 (지식 이름을 입력하면 그 주변만)",
    getArgumentCompletions: (prefix: string) => mapCompletions(completionCwd, prefix),
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      completionCwd = ctx.cwd;
      try {
        const url = await openKnowledgeMap(ctx.cwd, args, deps);
        ctx.ui.notify(`지식 지도: ${url} (새로고침하려면 /study-map을 다시 실행)`, "info");
      } catch (error) {
        // Map failures never affect stored learning progress.
        ctx.ui.notify(`지식 지도를 열지 못했습니다: ${error instanceof Error ? error.message : String(error)}`, "warning");
      }
    },
  });
}
