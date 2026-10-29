import { test } from "node:test";
import assert from "node:assert/strict";
import * as api from "../../src/bridge/agent-delivery.ts";

test("delivery sends immediately when the agent is idle", async () => {
  assert.equal(typeof api.deliverToAgent, "function", "extract shared agent delivery");
  const calls: unknown[][] = [];
  api.deliverToAgent(
    { sendUserMessage: (...args: unknown[]) => calls.push(args) },
    "prompt",
    "submission",
  );
  assert.deepEqual(calls, [["prompt"]]);
});

test("delivery falls back once when direct delivery fails", async () => {
  assert.equal(typeof api.deliverToAgent, "function");
  const calls: unknown[][] = [];
  api.deliverToAgent(
    {
      sendUserMessage: (...args: unknown[]) => {
        calls.push(args);
        if (calls.length === 1) throw new Error("busy");
      },
    },
    "prompt",
    "submission",
  );
  assert.deepEqual(calls, [["prompt"], ["prompt", { deliverAs: "followUp" }]]);
});

test("delivery reports a failed follow-up without throwing", async (t) => {
  assert.equal(typeof api.deliverToAgent, "function");
  const warning = t.mock.method(console, "warn", () => {});
  api.deliverToAgent(
    {
      sendUserMessage: () => {
        throw new Error("closed");
      },
    },
    "prompt",
    "submission",
  );
  assert.equal(warning.mock.calls.length, 1);
  assert.match(String(warning.mock.calls[0].arguments[0]), /submission/);
});
