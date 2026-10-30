import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./browser-server.ts";
import { graphScriptHash } from "../knowledge/knowledge-view.ts";

/** In-memory map snapshots keyed by an opaque ID. No file paths are accepted. */
export function createKnowledgeMapStore(limit = 20) {
  const snapshots = new Map<string, string>();
  return {
    put(id: string, html: string) {
      snapshots.set(id, html);
      while (snapshots.size > limit) snapshots.delete(snapshots.keys().next().value!);
    },
    get(id: string) {
      return snapshots.get(id);
    },
    clear() {
      snapshots.clear();
    },
  };
}

export type KnowledgeMapStore = ReturnType<typeof createKnowledgeMapStore>;

/** GET /knowledge/<id>; returns false when the request is not a map route. */
export function handleKnowledgeRoute(
  store: KnowledgeMapStore,
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith("/knowledge/")) return false;
  const match = url.pathname.match(/^\/knowledge\/([a-f0-9]{12,32})$/);
  if (!match || (req.method ?? "GET").toUpperCase() !== "GET") {
    sendJson(res, 404, { error: "Unknown knowledge map" });
    return true;
  }
  const html = store.get(match[1]);
  if (!html) {
    sendJson(res, 404, { error: "Unknown knowledge map" });
    return true;
  }
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src '${graphScriptHash()}'`,
  });
  res.end(html);
  return true;
}
