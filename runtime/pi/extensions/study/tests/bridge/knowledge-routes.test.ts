import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrowserServer } from "../../src/bridge/browser-server.ts";
import { createKnowledgeMapStore, handleKnowledgeRoute } from "../../src/bridge/knowledge-routes.ts";

async function serve(t: any) {
  const store = createKnowledgeMapStore(2);
  const server = createBrowserServer(async (req, res) => {
    if (!handleKnowledgeRoute(store, req, res)) {
      res.writeHead(418);
      res.end();
    }
  });
  const port = await server.start();
  t.after(() => server.close());
  return { store, base: `http://127.0.0.1:${port}` };
}

test("serves stored snapshots with a strict content security policy", async (t) => {
  const { store, base } = await serve(t);
  store.put("abcdef123456", "<html>map</html>");
  const res = await fetch(`${base}/knowledge/abcdef123456`);
  assert.equal(res.status, 200);
  const csp = res.headers.get("content-security-policy")!;
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(csp, /unsafe-inline'[^;]*script|script-src[^;]*unsafe/);
  assert.equal(await res.text(), "<html>map</html>");
});

test("rejects unknown IDs, path traversal and non-GET methods", async (t) => {
  const { store, base } = await serve(t);
  store.put("abcdef123456", "x");
  assert.equal((await fetch(`${base}/knowledge/ffffffffffff`)).status, 404);
  assert.equal((await fetch(`${base}/knowledge/..%2F..%2Fetc%2Fpasswd`)).status, 404);
  assert.equal((await fetch(`${base}/knowledge/abcdef123456`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${base}/other`)).status, 418);
});

test("keeps only the most recent snapshots", async (t) => {
  const { store } = await serve(t);
  store.put("aaaaaaaaaaaa", "1");
  store.put("bbbbbbbbbbbb", "2");
  store.put("cccccccccccc", "3");
  assert.equal(store.get("aaaaaaaaaaaa"), undefined);
  assert.equal(store.get("cccccccccccc"), "3");
});
