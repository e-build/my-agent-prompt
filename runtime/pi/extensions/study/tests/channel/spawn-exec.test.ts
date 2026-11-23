import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnExec } from "../../src/channel/spawn-exec.ts";

test("spawnExec pipes stdin and captures stdout without a shell", async () => {
  const result = await spawnExec("cat", [], "hello $HOME");
  assert.deepEqual(result, { code: 0, stdout: "hello $HOME", stderr: "" });
});

test("spawnExec reports a missing command as a failure, not a throw", async () => {
  const result = await spawnExec("definitely-not-a-command-xyz", []);
  assert.equal(result.code, 127);
  assert.match(result.stderr, /ENOENT/);
});

test("spawnExec returns the exit code and stderr of a failing command", async () => {
  const result = await spawnExec("sh", ["-c", "echo nope >&2; exit 3"]);
  assert.deepEqual(result, { code: 3, stdout: "", stderr: "nope\n" });
});
