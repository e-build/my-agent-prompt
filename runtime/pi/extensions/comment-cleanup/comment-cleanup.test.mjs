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
    extension,
    startRun: async () => {
      const sections = {};
      await emit("before_agent_start", { messageType: "user", prompt: "work", systemPromptOptions: { sections } });
      return sections;
    },
    /**
     * One agent edit: the file holds `before` (null: unchanged or missing) when the tool is called and `after` once it ran.
     * Returns the tool_result patch, or undefined when the extension left the result alone.
     */
    change: async (file, before, after, { toolName = "edit", isError = false } = {}) => {
      if (before !== null) put(file, before);
      const toolCallId = `call-${++calls}`;
      const input = { path: file };
      await emit("tool_call", { toolName, toolCallId, input });
      if (!isError) put(file, after);
      const original = [{ type: "text", text: isError ? "Edit failed." : `Successfully replaced 1 block(s) in ${file}.` }];
      return emit("tool_result", { toolName, toolCallId, input, content: original, details: undefined, isError });
    },
  };
}

const noticeOf = (patch) => {
  assert.ok(patch, "expected a notice on the tool result");
  assert.equal(patch.content.length, 2);
  return patch.content[1].text;
};

test("adds the rules to the system prompt as a comment_rules section", async (t) => {
  const h = await setup(t);
  const sections = await h.startRun();
  assert.equal(sections.comment_rules, readFileSync(join(here, "rules.md"), "utf8").trim());
});

test("does not add a turn before the agent settles", async (t) => {
  const h = await setup(t);
  assert.equal(h.extension.handlers.get("agent_before_settle"), undefined);
  assert.equal(h.extension.handlers.get("turn_end"), undefined);
});

test("appends the comments the edit added to the tool result and keeps the original text", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const patch = await h.change("src/user.ts", "const a = 1;\n", "// 사용자 조회\nconst a = 1;\n");

  assert.deepEqual(patch.content[0], { type: "text", text: "Successfully replaced 1 block(s) in src/user.ts." });
  const notice = noticeOf(patch);
  assert.match(notice, /^\[comment-cleanup\]/);
  assert.match(notice, /<comment_rules>/);
  assert.match(notice, /사용자에게 알리지 말고/);
  assert.match(notice, /src\/user\.ts\n\s+1: \/\/ 사용자 조회/);
});

test("leaves comments that were already in the file alone, even when they move", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const patch = await h.change(
    "a.ts",
    "// retry: the gateway drops the first call\ncall();\nrun(); // keep order\n",
    "function f() {\n  // retry: the gateway drops the first call\n  call();\n  run(2); // keep order\n}\n",
  );
  assert.equal(patch, undefined);
});

test("flags a second copy of a comment that existed once", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const notice = noticeOf(await h.change("a.ts", "// 재시도\ncall();\n", "// 재시도\ncall();\n// 재시도\ncall();\n"));
  assert.match(notice, /a\.ts\n\s+3: \/\/ 재시도$/m);
  assert.doesNotMatch(notice, /1: \/\/ 재시도/);
});

test("accepts given/when/then markers only in a file that already used them", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const kept = await h.change(
    "a.test.ts",
    "test('a', () => {\n  // given\n  const a = 1;\n});\n",
    "test('a', () => {\n  // given\n  const a = 1;\n});\ntest('b', () => {\n  // given\n  const b = 2;\n  // when & then\n  run(b);\n});\n",
  );
  assert.equal(kept, undefined);
  const notice = noticeOf(
    await h.change("b.test.ts", "test('a', () => {});\n", "test('a', () => {\n  // given\n  const a = 1;\n});\n"),
  );
  assert.match(notice, /b\.test\.ts\n\s+2: \/\/ given$/m);
});

test("ignores tool directives", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const patches = [
    await h.change(
      "a.ts",
      "run();\n",
      "#!/usr/bin/env node\n// eslint-disable-next-line no-console\n// @ts-expect-error\n// SPDX-License-Identifier: MIT\nrun();\n",
    ),
    await h.change("a.kt", "fun a() {}\n", "// language=SQL\n@Suppress(\"x\") // noinspection Foo\nfun a() {}\n"),
    await h.change("b.go", "package b\n", "//go:build linux\n\npackage b\n"),
    await h.change("c.py", "x = 1\n", "x = 1  # noqa: E501\ny = 2  # type: ignore\n"),
  ];
  assert.deepEqual(patches, [undefined, undefined, undefined, undefined]);
});

test("finds block, trailing, hash, dash and docstring comments", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const kt = noticeOf(
    await h.change("a.kt", "fun a() {}\n", "/**\n * 사용자를 조회한다.\n */\nfun a() {} // 조회\nval x = <T,>() => {/* 렌더 */}\n"),
  );
  const py = noticeOf(
    await h.change("b.py", "def f():\n    return 1\n", 'def f():\n    """값을 반환한다.\n\n    자세한 설명.\n    """\n    return 1  # 반환\n'),
  );
  const sql = noticeOf(await h.change("c.sql", "select 1;\n", "-- 조회\nselect 1; -- 하나\n"));

  assert.match(kt, /a\.kt\n\s+2: \* 사용자를 조회한다\.\n\s+4: \/\/ 조회\n\s+5: \/\* 렌더 \*\/(\n|$)/);
  assert.match(py, /b\.py\n\s+2: """값을 반환한다\.\n\s+4: 자세한 설명\.\n\s+6: # 반환/);
  assert.match(sql, /c\.sql\n\s+1: -- 조회\n\s+2: -- 하나/);
});

test("ignores comment markers inside string literals", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const ts = await h.change("a.ts", "run();\n", 'const url = "http://example.com/a";\nconst s = \'a // b\';\nconst t = `/* c */`;\n');
  const sh = await h.change("b.sh", "ls\n", 'echo "$#" "${#items[@]}"\necho "# not a comment"\n');
  assert.deepEqual([ts, sh], [undefined, undefined]);
});

test("does not read this extension's own source as comments", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const source = readFileSync(join(here, "index.ts"), "utf8");
  const notice = noticeOf(await h.change("copy.ts", "", source, { toolName: "write" }));
  assert.match(notice, /새로 생긴 주석 [1-9]\d?개/);
  assert.doesNotMatch(notice, /const MAX_LISTED/);
});

test("ignores files that are not source code", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const md = await h.change("README.md", "# Title\n", "# Title\n\n<!-- note -->\n# Another\n");
  const yaml = await h.change("config.yaml", "a: 1\n", "# added\na: 1\n");
  assert.deepEqual([md, yaml], [undefined, undefined]);
});

test("treats every comment in a newly written file as added", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const notice = noticeOf(await h.change("src/new.ts", null, "// 새 파일\nexport const a = 1;\n", { toolName: "write" }));
  assert.match(notice, /src\/new\.ts\n\s+1: \/\/ 새 파일/);
});

test("raises each comment once, so later edits list only the comments they added", async (t) => {
  const h = await setup(t);
  await h.startRun();
  assert.match(noticeOf(await h.change("a.ts", "run();\n", "// 첫 번째\nrun();\n")), /1: \/\/ 첫 번째/);

  const second = noticeOf(await h.change("a.ts", null, "// 첫 번째\nrun();\n// 두 번째\n"));
  assert.match(second, /3: \/\/ 두 번째/);
  assert.doesNotMatch(second, /첫 번째/);
});

test("does not raise a comment again after the agent kept it", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const reason = "// 게이트웨이가 첫 호출을 버려서 한 번 더 부른다";
  noticeOf(await h.change("a.ts", "run();\n", `${reason}\nrun();\n`));
  assert.equal(await h.change("a.ts", null, `${reason}\nrun();\nrun();\n`), undefined);
});

test("says nothing for an edit that only removes comments", async (t) => {
  const h = await setup(t);
  await h.startRun();
  noticeOf(await h.change("a.ts", "run();\n", "// 임시\nrun();\n"));
  assert.equal(await h.change("a.ts", null, "run();\n"), undefined);
});

test("leaves a failed edit's result alone", async (t) => {
  const h = await setup(t);
  await h.startRun();
  assert.equal(await h.change("a.ts", "run();\n", "// 사용자 조회\nrun();\n", { isError: true }), undefined);
});

test("starts each run from the files as they are, so comments from earlier runs are not raised", async (t) => {
  const h = await setup(t);
  await h.startRun();
  noticeOf(await h.change("a.ts", "run();\n", "// 사용자 조회\nrun();\n"));

  await h.startRun();
  assert.equal(await h.change("a.ts", null, "// 사용자 조회\nrun();\nrun();\n"), undefined);
});

test("lists at most 40 comments and counts the rest", async (t) => {
  const h = await setup(t);
  await h.startRun();
  const lines = Array.from({ length: 45 }, (_, i) => `// 주석 ${i + 1}`).join("\n");
  const notice = noticeOf(await h.change("a.ts", "run();\n", `${lines}\nrun();\n`));
  assert.match(notice, /40: \/\/ 주석 40\n/);
  assert.doesNotMatch(notice, /41: \/\/ 주석 41\n/);
  assert.match(notice, /그 외 5개/);
});
