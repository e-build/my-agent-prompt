import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { KnowledgeMapStore } from "../bridge/knowledge-routes.ts";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { buildKnowledgeView, renderKnowledgeMap } from "./knowledge-view.ts";

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
  pi.registerCommand("study-map", {
    description: "공통 지식 지도를 읽기 전용으로 브라우저에 엽니다 (/study-map [지식 ID])",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
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
