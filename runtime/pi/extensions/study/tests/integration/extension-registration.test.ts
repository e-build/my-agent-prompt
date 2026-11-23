import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { workspaceFixture } from "../support/fixtures.ts";
import { readScope } from "../../src/cards/card-store.ts";

// The pure tests need only Node. This host test loads index.ts through Pi's jiti and typebox.
const require = createRequire(import.meta.url);
let host: { jiti: string; pi: string; typebox: string } | undefined;
try {
  const piRoot = (process.env.NODE_PATH ?? "")
    .split(delimiter)
    .map((root) => join(root, "@earendil-works/pi-coding-agent"))
    .find((root) => existsSync(join(root, "dist/index.js")));
  if (!piRoot) throw new Error("Pi host not found");
  host = {
    jiti: require.resolve("jiti", { paths: [piRoot] }),
    pi: join(piRoot, "dist/index.js"),
    typebox: require.resolve("typebox", { paths: [piRoot] }),
  };
} catch {
  // Explicitly skipped outside a Pi development environment.
}
const options = { skip: !host && "Set NODE_PATH to the global npm root that has Pi installed" };

async function harness() {
  const { createJiti } = require(host!.jiti);
  const jiti = createJiti(import.meta.url, {
    alias: { "@earendil-works/pi-coding-agent": host!.pi, typebox: host!.typebox },
  });
  const events = new Map<string, Function[]>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const messages: string[] = [];
  const pi = {
    on: (name: string, handler: Function) => events.set(name, [...(events.get(name) ?? []), handler]),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    sendUserMessage: (message: string) => messages.push(message),
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    events: { emit() {} },
  };
  const extension = await jiti.import("../../index.ts", { default: true });
  extension(pi);
  return { tools, commands, messages, events };
}

const notices = () => {
  const list: string[] = [];
  return { list, ui: { notify: (m: string) => list.push(m), select: async () => undefined, confirm: async () => true } };
};

test("registers exactly the simplified tools and commands", options, async () => {
  const h = await harness();
  assert.deepEqual([...h.tools.keys()].sort(), [
    "study_answer_record",
    "study_ask",
    "study_checkpoint_publish",
    "study_lab_step_update",
    "study_lab_verify",
    "study_phase",
    "study_placement_finish",
    "study_preflight",
    "study_project_approve",
    "study_review_finish",
    "study_review_next",
    "study_send",
    "study_test_finish",
  ]);
  assert.deepEqual([...h.commands.keys()].sort(), [
    "study-chapter",
    "study-checkpoint",
    "study-init",
    "study-map",
    "study-prompts",
    "study-review",
  ]);
  for (const tool of h.tools.values()) assert.ok(tool.promptSnippet, `${tool.name} needs a promptSnippet`);
});

test("every promptGuideline names its tool", options, async () => {
  const h = await harness();
  for (const tool of h.tools.values())
    for (const line of tool.promptGuidelines ?? []) assert.match(line, /study_[a-z_]+/, `${tool.name}: ${line}`);
});

test("/study-chapter sends the concept request for a fresh project", options, async (t) => {
  const root = await workspaceFixture(t);
  const h = await harness();
  const { list, ui } = notices();
  await h.commands.get("study-chapter").handler("01", { cwd: join(root, "study-alpha"), hasUI: false, ui });
  assert.deepEqual(list, []);
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0], /# STUDY_PHASE_REQUEST[\s\S]*- phase: concept[\s\S]*# 개념 학습/);
});

test("study_ask through the chat channel stores criteria and returns the public question", options, async (t) => {
  const root = await workspaceFixture(t);
  const project = join(root, "study-alpha");
  const h = await harness();
  const result = await h.tools.get("study_ask").execute(
    "id",
    {
      cardJson: JSON.stringify({
        kind: "question",
        id: "c-host",
        chapterSlug: "ch-01-intro",
        purpose: "concept-check",
        askConfidence: true,
        items: [{ id: "q1", prompt: "무엇이 출력되나요?" }],
      }),
      criteriaJson: JSON.stringify({ q1: { answer: "42", rubric: "42면 정답" } }),
    },
    undefined,
    undefined,
    { cwd: project },
  );
  assert.match(result.content[0].text, /그대로 보여 주세요[\s\S]*무엇이 출력되나요\?\*\* \[c-host\/q1\]/);
  assert.doesNotMatch(result.content[0].text, /42면 정답/);
  assert.equal((await readScope(project, "ch-01-intro")).cards["c-host"].criteria?.q1.answer, "42");
});

test("/study-prompts eject copies a default into the study root", options, async (t) => {
  const root = await workspaceFixture(t);
  const h = await harness();
  const { list, ui } = notices();
  await h.commands.get("study-prompts").handler("eject lab", { cwd: join(root, "study-alpha"), ui });
  assert.match(list[0], /복사함/);
  assert.match(await readFile(join(root, ".study", "prompts", "lab.md"), "utf8"), /# 실습/);
});

test("/study-init without a topic only explains usage", options, async (t) => {
  const root = await workspaceFixture(t);
  await mkdir(join(root, "x"));
  await writeFile(join(root, "x", "a"), "");
  const h = await harness();
  const { list, ui } = notices();
  await h.commands.get("study-init").handler("", { cwd: root, ui });
  assert.deepEqual(h.messages, []);
  assert.match(list[0], /사용법/);
});
