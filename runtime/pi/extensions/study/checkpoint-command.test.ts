import { test } from "node:test";
import assert from "node:assert/strict";
import * as command from "./checkpoint-command.ts";

function harness() {
  const commands = new Map<string, any>();
  const tools = new Map<string, any>();
  const messages: string[] = [];
  const notices: string[] = [];
  const events = new Map<string, any>();
  const pi = {
    registerCommand: (name: string, def: any) => commands.set(name, def),
    registerTool: (def: any) => tools.set(def.name, def),
    sendUserMessage: (text: string) => messages.push(text),
    on: (name: string, handler: any) => events.set(name, handler),
  };
  const ctx = { cwd: "/study", isIdle: () => true, ui: { notify: (text: string) => notices.push(text) }, sessionManager: { getSessionId: () => "session-1" } };
  return { pi, ctx, commands, tools, messages, notices, events };
}
const request = { id: "request-1", projectRoot: "/study", chapterSlug: "ch-04-cache", phase: "concept", checkpointPath: "/study/ch-04-cache/checkpoint.md" };

test("checkpoint registration function is exported", () => {
  assert.equal(typeof command.registerStudyCheckpoint, "function");
});

test("command prepares target and sends evidence-aware prompt without starting a quiz", async () => {
  const h = harness();
  command.registerStudyCheckpoint(h.pi as any, {}, async (_path, fn) => fn(), {
    prepare: async () => request as any,
    publish: async () => ({ path: request.checkpointPath, saved: true, commit: "abc", pushed: true }),
  });
  await h.commands.get("study-checkpoint").handler("04", h.ctx);
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0], /STUDY_CHECKPOINT_REQUEST/);
  assert.match(h.messages[0], /request-1/);
  assert.match(h.messages[0], /self_reported/);
  assert.match(h.messages[0], /퀴즈.*시작하지/);
  assert.match(h.messages[0], /study_checkpoint_publish/);
});

test("busy command and invalid target do not send a checkpoint request", async () => {
  const h = harness();
  command.registerStudyCheckpoint(h.pi as any, {}, async (_path, fn) => fn(), {
    prepare: async () => { throw new Error("target missing"); }, publish: async () => { throw new Error("unused"); },
  });
  await h.commands.get("study-checkpoint").handler("", { ...h.ctx, isIdle: () => false });
  await h.commands.get("study-checkpoint").handler("", h.ctx);
  assert.equal(h.messages.length, 0);
  assert.match(h.notices.join(" "), /응답.*target missing/);
});

test("publish tool rejects missing command authorization and session mismatch", async () => {
  const h = harness();
  command.registerStudyCheckpoint(h.pi as any, {}, async (_path, fn) => fn(), {
    prepare: async () => request as any, publish: async () => { throw new Error("should not publish"); },
  });
  const tool = h.tools.get("study_checkpoint_publish");
  const args = { requestId: "request-1", recordJson: "{}" };
  await assert.rejects(tool.execute("id", args, undefined, undefined, h.ctx), /명령/);
  await h.commands.get("study-checkpoint").handler("", h.ctx);
  await assert.rejects(tool.execute("id", args, undefined, undefined, { ...h.ctx, sessionManager: { getSessionId: () => "other" } }), /세션/);
  h.events.get("session_start")();
  await assert.rejects(tool.execute("id", args, undefined, undefined, h.ctx), /명령/);
});

test("authorized publish is queued and reports push failure as an error without losing commit", async () => {
  const h = harness();
  let queued = 0;
  command.registerStudyCheckpoint(h.pi as any, {}, async (path, fn) => { assert.equal(path, request.checkpointPath); queued++; return fn(); }, {
    prepare: async () => request as any,
    publish: async () => ({ path: request.checkpointPath, saved: true, commit: "abc", pushed: false, error: "push rejected" }),
  });
  await h.commands.get("study-checkpoint").handler("", h.ctx);
  const result = await h.tools.get("study_checkpoint_publish").execute("id", { requestId: "request-1", recordJson: "{}" }, undefined, undefined, h.ctx);
  assert.equal(queued, 1);
  assert.equal(result.isError, true);
  assert.equal(result.details.commit, "abc");
  assert.equal(result.details.pushed, false);
});
