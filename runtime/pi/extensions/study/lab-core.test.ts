import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLabManifest, saveLabManifest, updateLabStep, verifyLabStep, type LabManifest } from "./lab-core.ts";

async function setup(): Promise<{ root: string; manifest: LabManifest }> {
  const root = await mkdtemp(join(tmpdir(), "lab-core-"));
  await mkdir(join(root, "app", "build", "test-results", "test"), { recursive: true });
  await mkdir(join(root, "ch-01", "lab"), { recursive: true });
  await writeFile(join(root, "app", "src.kt"), "code");
  const manifest: LabManifest = {
    version: 1,
    chapterSlug: "ch-01",
    mode: "application",
    workspace: "app",
    steps: [{ id: "cache", title: "Cache", status: "in_progress", learnerFiles: ["app/src.kt"], requiredArtifacts: ["ch-01/lab/result.md"], verify: { cwd: "app", command: "./gradlew test", expectedTests: 2 } }],
  };
  await saveLabManifest(root, manifest);
  return { root, manifest };
}

test("rejects lab manifest paths outside the project", async () => {
  const root = await mkdtemp(join(tmpdir(), "lab-core-"));
  await assert.rejects(() => loadLabManifest(root, "../outside"), /프로젝트 밖 경로/);
});

test("fails when artifacts are missing or actual test count is zero", async () => {
  const { root } = await setup();
  const result = await verifyLabStep(root, "ch-01", "cache", async () => ({ code: 0, stdout: "BUILD SUCCESSFUL", stderr: "" }));
  assert.equal(result.passed, false);
  assert.match(result.messages.join(" "), /필수 파일 누락/);
  assert.match(result.messages.join(" "), /실제 테스트 수 0/);
});

test("passes with required artifacts and expected JUnit count", async () => {
  const { root } = await setup();
  await writeFile(join(root, "ch-01", "lab", "result.md"), "evidence");
  await writeFile(join(root, "app", "build", "test-results", "test", "TEST-x.xml"), '<testsuite tests="2" failures="0" errors="0"></testsuite>');
  const result = await verifyLabStep(root, "ch-01", "cache", async () => ({ code: 0, stdout: "BUILD SUCCESSFUL", stderr: "" }));
  assert.equal(result.passed, true);
  assert.equal(result.command?.testCount, 2);
});

test("skipped_understood requires evidence", async () => {
  const { root, manifest } = await setup();
  assert.throws(() => updateLabStep(manifest, "cache", "skipped_understood"), /근거/);
  updateLabStep(manifest, "cache", "skipped_understood", "test 정답 + 사용자 요청");
  await saveLabManifest(root, manifest);
  const result = await verifyLabStep(root, "ch-01", "cache", async () => ({ code: 1, stdout: "", stderr: "should not run" }));
  assert.equal(result.passed, true);
  assert.match(result.messages[0], /test 정답/);
});
