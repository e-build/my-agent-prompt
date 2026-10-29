import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { questionSet } from "./test-support/fixtures.ts";

// The pure tests require only Node. This optional host smoke test uses Pi's
// installed dependencies via NODE_PATH, without installing them into this repo.
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
  // Explicitly skipped when running outside a Pi development environment.
}

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
    on: (name: string, handler: Function) =>
      events.set(name, [...(events.get(name) ?? []), handler]),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    sendUserMessage: (message: string) => messages.push(message),
    events: { emit() {} },
  };
  const extension = await jiti.import("./index.ts", { default: true });
  extension(pi);
  const emit = async (name: string, payload = {}) => {
    for (const handler of events.get(name) ?? []) await handler(payload);
  };
  return { jiti, pi, events, tools, commands, messages, emit };
}

const options = {
  skip:
    !host &&
    "Set NODE_PATH to the installed Pi package and its node_modules for the host smoke test",
};

test(
  "extension registers public tools and commands without starting a server",
  options,
  async () => {
    const h = await harness();
    assert.deepEqual(
      [...h.tools.keys()].sort(),
      [
        "study_checkpoint_publish",
        "study_lab_verify",
        "study_lab_step_update",
        "study_review_refresh",
        "study_pack_refresh",
        "study_preflight",
        "study_curriculum_open",
        "study_diagnosis_open",
        "study_test_open",
      ].sort(),
    );
    assert.deepEqual([...h.commands.keys()].sort(), ["study-chapter", "study-checkpoint"]);
    const resources = await h.events.get("resources_discover")![0]();
    assert.match(resources.promptPaths[0], /study\/prompts$/);
    await h.emit("message_end", { message: { role: "user", content: "ignored" } });
    assert.deepEqual(h.messages, []);
    await h.emit("session_shutdown");
    await h.emit("session_shutdown");
  },
);

test(
  "assessment tools preserve artifacts, reuse and phase updates without opening a browser",
  options,
  async (t) => {
    const h = await harness();
    const temp = await mkdtemp(join(tmpdir(), "study-tool-registration-"));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const root = join(temp, "study-example");
    await mkdir(join(root, "ch-01"), { recursive: true });
    await mkdir(join(root, ".study"));
    await writeFile(
      join(root, ".study", "project.json"),
      JSON.stringify({ version: 1, projectSlug: "study-example", topic: "Topic", chapters: {} }),
    );
    await writeFile(join(root, "README.md"), "# Study\n");
    await writeFile(join(root, "ch-01", "README.md"), "# Chapter\n");
    const { registerAssessmentTools } = await h.jiti.import("./assessment-tools.ts");
    const sessions = new Map();
    const testSessions = new Map();
    const opened: string[] = [];
    const phases: unknown[][] = [];
    let observed = 0;
    registerAssessmentTools(h.pi, {
      sessions,
      testSessions,
      templatePath: fileURLToPath(new URL("./assets/assessment-template.html", import.meta.url)),
      startServer: async () => 12345,
      openBrowser: (url: string) => opened.push(url),
      onAssessmentOpened: () => {
        observed++;
      },
      updateProjectPhase: async (...args: unknown[]) => {
        phases.push(args);
      },
    });
    const params = {
      chapterSlug: "ch-01",
      chapterTitle: "Chapter",
      questionsJson: JSON.stringify(questionSet()),
    };
    const run = (name: string, args = params, signal?: AbortSignal) =>
      h.tools.get(name).execute("call", args, signal, undefined, { cwd: root });
    const questions = Array.from({ length: 10 }, (_, index) => ({
      ...questionSet().questions[0],
      id: `q${index + 1}`,
      points: 1,
      type: index < 7 ? "single-choice" : index < 9 ? "short-answer" : "essay",
      ...(index < 7
        ? {
            options: [
              { id: "A", text: "A" },
              { id: "B", text: "B" },
            ],
          }
        : {}),
    }));
    const diagnosis = await run("study_diagnosis_open", {
      ...params,
      questionsJson: JSON.stringify({
        ...questionSet(),
        questions,
        sections: [{ id: "core", title: "Core", questionIds: questions.map((q) => q.id) }],
      }),
    });
    assert.match(diagnosis.details.url, /^http:\/\/127.0.0.1:12345\/diagnosis\//);
    assert.equal(sessions.size, 1);
    assert.ok((await readFile(diagnosis.details.htmlPath, "utf8")).includes('"kind":"diagnosis"'));
    const exam = await run("study_test_open");
    const reused = await run("study_test_open");
    assert.equal(reused.details.reused, true);
    assert.equal(reused.details.id, exam.details.id);
    assert.equal(testSessions.size, 1);
    assert.equal(observed, 3);
    assert.equal(opened.length, 3);
    assert.equal(phases.length, 2);
    assert.equal(phases[1][3], "awaiting_submission");
    const cancelled = await run("study_test_open", params, AbortSignal.abort());
    assert.equal(cancelled.content[0].text, "취소됨");
    assert.ok(Object.hasOwn(cancelled, "details"));
    await assert.rejects(
      run("study_diagnosis_open", { ...params, questionsJson: "{" }),
      /올바른 JSON/,
    );
    assert.equal(sessions.size, 1);
  },
);
