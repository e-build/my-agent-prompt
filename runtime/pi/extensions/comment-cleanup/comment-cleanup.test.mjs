import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

function findPiPackage() {
  if (process.env.PI_PACKAGE_DIR) return process.env.PI_PACKAGE_DIR;
  const installRoot = join(homedir(), ".pi/agent/install");
  const versionFile = join(installRoot, "current-version");
  if (existsSync(versionFile)) {
    const version = readFileSync(versionFile, "utf8").trim();
    const managed = join(installRoot, "releases", version, "node_modules/@earendil-works/pi-coding-agent");
    if (existsSync(managed)) return managed;
  }
  return join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
}

const { loadExtensions } = await import(pathToFileURL(join(findPiPackage(), "dist/core/extensions/loader.js")).href);

async function setup(t) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "comment-cleanup-test-")));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const loaded = await loadExtensions([join(here, "index.ts")], cwd);
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions[0];
  const ctx = { cwd, hasUI: false };
  let calls = 0;

  const emit = async (name, event = {}) => {
    let result;
    for (const handler of extension.handlers.get(name) || []) result = await handler({ type: name, ...event }, ctx);
    return result;
  };
  const put = (file, content) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), content);
  };

  return {
    cwd,
    put,
    startRun: async () => {
      const sections = {};
      await emit("before_agent_start", { messageType: "user", prompt: "work", systemPromptOptions: { sections } });
      return sections;
    },
    /** One agent edit: the file holds `before` (null: missing) when the tool is called and `after` once it ran. */
    change: async (file, before, after, toolName = "edit") => {
      if (before !== null) put(file, before);
      await emit("tool_call", { toolName, toolCallId: `call-${++calls}`, input: { path: file } });
      put(file, after);
    },
    settle: (overrides = {}) =>
      emit("agent_before_settle", { outcome: "completed", entries: [], continue: false, context: {}, ...overrides }),
  };
}

const messageOf = (result) => result.entries.at(-1).content;

test("adds the rules to the system prompt as a comment_rules section", async (t) => {
  const h = await setup(t);
  const sections = await h.startRun();
  assert.equal(sections.comment_rules, readFileSync(join(here, "rules.md"), "utf8").trim());
});

test("asks for one cleanup pass listing the comments the agent added", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("src/user.ts", "const a = 1;\n", "// 사용자 조회\nconst a = 1;\n");

  const earlier = { type: "custom", customType: "other-extension" };
  const result = await h.settle({ entries: [earlier] });

  assert.equal(result.continue, true);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0], earlier);
  const entry = result.entries[1];
  assert.equal(entry.type, "custom_message");
  assert.equal(entry.customType, "comment-cleanup");
  assert.equal(entry.display, true);
  assert.match(entry.content, /src\/user\.ts\n\s+1: \/\/ 사용자 조회/);
  assert.match(entry.content, /<comment_rules>/);
});

test("leaves comments that were already in the file alone, even when they move", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change(
    "a.ts",
    "// retry: the gateway drops the first call\ncall();\nrun(); // keep order\n",
    "function f() {\n  // retry: the gateway drops the first call\n  call();\n  run(2); // keep order\n}\n",
  );
  assert.equal(await h.settle(), undefined);
});

test("flags a second copy of a comment that existed once", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("a.ts", "// 재시도\ncall();\n", "// 재시도\ncall();\n// 재시도\ncall();\n");
  const message = messageOf(await h.settle());
  assert.match(message, /a\.ts\n\s+3: \/\/ 재시도$/);
  assert.doesNotMatch(message, /1: \/\/ 재시도/);
});

test("accepts given/when/then markers only in a file that already used them", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change(
    "a.test.ts",
    "test('a', () => {\n  // given\n  const a = 1;\n});\n",
    "test('a', () => {\n  // given\n  const a = 1;\n});\ntest('b', () => {\n  // given\n  const b = 2;\n  // when & then\n  run(b);\n});\n",
  );
  await h.change("b.test.ts", "test('a', () => {});\n", "test('a', () => {\n  // given\n  const a = 1;\n});\n");

  const message = messageOf(await h.settle());
  assert.doesNotMatch(message, /a\.test\.ts/);
  assert.match(message, /b\.test\.ts\n\s+2: \/\/ given$/);
});

test("does not ask for cleanup when only tool directives were added", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change(
    "a.ts",
    "run();\n",
    "#!/usr/bin/env node\n// eslint-disable-next-line no-console\n// @ts-expect-error\n// SPDX-License-Identifier: MIT\nrun();\n",
  );
  await h.change("a.kt", "fun a() {}\n", "// language=SQL\n@Suppress(\"x\") // noinspection Foo\nfun a() {}\n");
  await h.change("b.go", "package b\n", "//go:build linux\n\npackage b\n");
  await h.change("c.py", "x = 1\n", "x = 1  # noqa: E501\ny = 2  # type: ignore\n");
  assert.equal(await h.settle(), undefined);
});

test("finds block, trailing, hash, dash and docstring comments", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change(
    "a.kt",
    "fun a() {}\n",
    "/**\n * 사용자를 조회한다.\n */\nfun a() {} // 조회\nval x = <T,>() => {/* 렌더 */}\n",
  );
  await h.change("b.py", "def f():\n    return 1\n", 'def f():\n    """값을 반환한다.\n\n    자세한 설명.\n    """\n    return 1  # 반환\n');
  await h.change("c.sql", "select 1;\n", "-- 조회\nselect 1; -- 하나\n");

  const message = messageOf(await h.settle());
  assert.match(message, /a\.kt\n\s+2: \* 사용자를 조회한다\.\n\s+4: \/\/ 조회\n\s+5: \/\* 렌더 \*\/(\n|$)/);
  assert.match(message, /b\.py\n\s+2: """값을 반환한다\.\n\s+4: 자세한 설명\.\n\s+6: # 반환/);
  assert.match(message, /c\.sql\n\s+1: -- 조회\n\s+2: -- 하나/);
});

test("ignores comment markers inside string literals", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("a.ts", "run();\n", 'const url = "http://example.com/a";\nconst s = \'a // b\';\nconst t = `/* c */`;\n');
  await h.change("b.sh", "ls\n", 'echo "$#" "${#items[@]}"\necho "# not a comment"\n');
  assert.equal(await h.settle(), undefined);
});

test("ignores files that are not source code", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("README.md", "# Title\n", "# Title\n\n<!-- note -->\n# Another\n");
  await h.change("config.yaml", "a: 1\n", "# added\na: 1\n");
  assert.equal(await h.settle(), undefined);
});

test("treats every comment in a newly written file as added", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("src/new.ts", null, "// 새 파일\nexport const a = 1;\n", "write");
  assert.match(messageOf(await h.settle()), /src\/new\.ts\n\s+1: \/\/ 새 파일/);
});

test("compares against the file as it was before the first edit of several", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("a.ts", "run();\n", "// 첫 번째\nrun();\n");
  await h.change("a.ts", null, "// 첫 번째\nrun();\n// 두 번째\n");
  const message = messageOf(await h.settle());
  assert.match(message, /1: \/\/ 첫 번째/);
  assert.match(message, /3: \/\/ 두 번째/);
});

test("says nothing when the agent removed its own comment before finishing", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("a.ts", "run();\n", "// 임시\nrun();\n");
  await h.change("a.ts", null, "run();\n");
  assert.equal(await h.settle(), undefined);
});

test("asks once per run and does not raise kept comments again", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("a.ts", "run();\n", "// 게이트웨이가 첫 호출을 버려서 한 번 더 부른다\nrun();\n");
  assert.equal((await h.settle()).continue, true);

  await h.change("a.ts", null, "// 게이트웨이가 첫 호출을 버려서 한 번 더 부른다\nrun();\nrun();\n");
  assert.equal(await h.settle(), undefined);

  await h.startRun();
  await h.change("a.ts", null, "// 게이트웨이가 첫 호출을 버려서 한 번 더 부른다\nrun();\n");
  assert.equal(await h.settle(), undefined);
});

test("keeps comments from a failed run for the next run that completes", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("a.ts", "run();\n", "// 사용자 조회\nrun();\n");
  assert.equal(await h.settle({ outcome: "error" }), undefined);

  await h.startRun();
  assert.match(messageOf(await h.settle()), /1: \/\/ 사용자 조회/);
});

test("asks again in a new run after a cleanup pass was interrupted", async (t) => {
  const h = await setup(t);
  await h.startRun();
  await h.change("a.ts", "run();\n", "// 사용자 조회\nrun();\n");
  assert.equal((await h.settle()).continue, true);

  await h.startRun();
  await h.change("b.ts", "run();\n", "// 주문 조회\nrun();\n");
  const message = messageOf(await h.settle());
  assert.match(message, /b\.ts\n\s+1: \/\/ 주문 조회/);
  assert.doesNotMatch(message, /a\.ts/);
});

test("lists at most 40 comments and counts the rest", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const lines = Array.from({ length: 45 }, (_, i) => `// 주석 ${i + 1}`).join("\n");
  await h.change("a.ts", "run();\n", `${lines}\nrun();\n`);
  const message = messageOf(await h.settle());
  assert.match(message, /40: \/\/ 주석 40\n/);
  assert.doesNotMatch(message, /41: \/\/ 주석 41\n/);
  assert.match(message, /그 외 5개/);
});
