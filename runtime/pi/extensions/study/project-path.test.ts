import { test } from "node:test";
import assert from "node:assert/strict";

import { projectPath } from "./project-path.ts";

test("resolves paths inside the study project", () => {
  assert.equal(projectPath("/tmp/study", "ch-01-cache", "test.html"), "/tmp/study/ch-01-cache/test.html");
});

test("rejects paths outside the study project", () => {
  assert.throws(() => projectPath("/tmp/study", "../outside", "test.html"), /프로젝트 밖 경로/);
  assert.throws(() => projectPath("/tmp/study", "/tmp/outside"), /프로젝트 밖 경로/);
});
