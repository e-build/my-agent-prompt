import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLabManifest, recordLabResult, saveLabManifest, updateLabStep, verifyLabStep, type LabManifest } from "./lab-core.ts";

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

test("records verified lab results with observation and takeaway in append-only chapter notes", async () => {
  const { root, manifest } = await setup();
  await writeFile(join(root, "ch-01", "lab", "result.md"), "artifact");
  await writeFile(join(root, "app", "build", "test-results", "test", "TEST-x.xml"), '<testsuite tests="2" failures="0" errors="0"></testsuite>');
  const verification = await verifyLabStep(root, "ch-01", "cache", async () => ({ code: 0, stdout: "BUILD SUCCESSFUL", stderr: "" }));

  await recordLabResult(root, manifest, "cache", {
    observation: "miss에서 loader가 한 번 호출됐다.",
    takeaway: "캐시 계층이 적재 책임을 한곳에 둔다.",
    verification,
  });

  const notes = await readFile(join(root, "ch-01", "lab", "results.md"), "utf8");
  assert.match(notes, /miss에서 loader가 한 번 호출됐다/);
  assert.match(notes, /캐시 계층이 적재 책임을 한곳에 둔다/);
  assert.match(notes, /실제 테스트 수: 2/);
});

test("does not record unverified or empty lab results", async () => {
  const { root, manifest } = await setup();
  const failed = await verifyLabStep(root, "ch-01", "cache", async () => ({ code: 1, stdout: "", stderr: "failed" }));
  await assert.rejects(() => recordLabResult(root, manifest, "cache", {
    observation: "something",
    takeaway: "something learned",
    verification: failed,
  }), /검증 통과/);
  await assert.rejects(() => recordLabResult(root, manifest, "cache", {
    observation: " ",
    takeaway: "something learned",
    verification: { ...failed, passed: true },
  }), /관찰 결과/);
});

test("normalizes legacy verifyCommands manifests and actually executes the command", async () => {
  const { root } = await setup();
  await writeFile(join(root, "ch-01", "lab", "manifest.json"), JSON.stringify({
    version: 1,
    chapterSlug: "ch-01",
    mode: "application",
    workspace: "app",
    steps: [{
      id: "cache",
      title: "Cache",
      status: "in_progress",
      learnerFiles: ["app/src.kt"],
      verifyCommands: ["cd app && ./gradlew cleanTest test"],
      expectedTests: { total: 2, failures: 0 },
      cliEvidence: ["redis-cli TTL k"],
    }],
  }, null, 2));
  await writeFile(join(root, "ch-01", "lab", "result.md"), "evidence");
  await writeFile(join(root, "app", "build", "test-results", "test", "TEST-x.xml"), '<testsuite tests="2" failures="0" errors="0"></testsuite>');

  const executed: Array<{ command: string; args: string[] }> = [];
  const result = await verifyLabStep(root, "ch-01", "cache", async (command, args, cwd) => {
    executed.push({ command, args });
    return { code: 0, stdout: "BUILD SUCCESSFUL", stderr: "" };
  });

  assert.equal(result.passed, true, result.messages.join("; "));
  assert.equal(executed.length, 1);
  assert.match(executed[0].args.join(" "), /gradlew cleanTest test/);
  assert.equal(result.command?.testCount, 2);

  const manifest = await loadLabManifest(root, "ch-01");
  assert.equal(manifest.steps[0].verify?.command, "cd app && ./gradlew cleanTest test");
  assert.equal(manifest.steps[0].verify?.expectedTests, 2);
});

test("fails closed when a step defines no verification command", async () => {
  const { root } = await setup();
  await writeFile(join(root, "ch-01", "lab", "manifest.json"), JSON.stringify({
    version: 1,
    chapterSlug: "ch-01",
    mode: "application",
    workspace: "app",
    steps: [{ id: "cache", title: "Cache", status: "in_progress", learnerFiles: ["app/src.kt"] }],
  }, null, 2));

  const result = await verifyLabStep(root, "ch-01", "cache", async () => ({ code: 0, stdout: "should not run", stderr: "" }));
  assert.equal(result.passed, false);
  assert.match(result.messages.join("; "), /검증 명령이 정의되지 않았습니다/);
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
