import { test } from "node:test";
import assert from "node:assert/strict";

import * as api from "./browser-server.ts";

test("browser server exposes a lazy session-scoped lifecycle", async () => {
  assert.equal(typeof api.createBrowserServer, "function", "extract the browser server lifecycle");
  const events: number[] = [];
  const server = api.createBrowserServer(
    async (_req: unknown, res: any) => {
      res.writeHead(200);
      res.end("ready");
    },
    (port: number) => events.push(port),
  );
  assert.equal(server.port, null);
  const port = await server.start();
  try {
    assert.equal(await server.start(), port);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "ready");
    assert.deepEqual(events, [port]);
  } finally {
    await server.close();
  }
  assert.equal(server.port, null);
  await server.close();
});

test("browser server turns route errors into JSON errors", async () => {
  assert.equal(typeof api.createBrowserServer, "function");
  const server = api.createBrowserServer(async () => {
    throw new Error("route failed");
  });
  const port = await server.start();
  try {
    const result = await fetch(`http://127.0.0.1:${port}`);
    assert.equal(result.status, 500);
    assert.deepEqual(await result.json(), { error: "route failed" });
    assert.equal(result.headers.get("cache-control"), "no-store");
  } finally {
    await server.close();
  }
});
