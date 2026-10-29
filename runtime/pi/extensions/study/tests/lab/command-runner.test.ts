import { test } from "node:test";
import assert from "node:assert/strict";
import * as api from "../../src/lab/command-runner.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

test("command runner forwards execution context and normalizes missing output", async () => {
  assert.equal(typeof api.createCommandRunner, "function", "share the Pi command adapter");
  const calls: unknown[][] = [];
  const run = api.createCommandRunner({
    exec: async (...args: unknown[]) => {
      calls.push(args);
      // Exercise legacy/malformed host output without weakening the production API.
      return {} as Awaited<ReturnType<ExtensionAPI["exec"]>>;
    },
  });
  assert.deepEqual(await run("java", ["--version"], "/workspace"), {
    code: 1,
    stdout: "",
    stderr: "",
  });
  assert.deepEqual(calls, [["java", ["--version"], { cwd: "/workspace" }]]);
});

test("command runner preserves successful command output", async () => {
  assert.equal(typeof api.createCommandRunner, "function");
  const result = { code: 0, stdout: "ok", stderr: "warning" };
  assert.deepEqual(
    await api.createCommandRunner({ exec: async () => ({ ...result, killed: false }) })(
      "java",
      [],
      "/workspace",
    ),
    result,
  );
});
