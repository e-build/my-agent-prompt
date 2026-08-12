import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveProjectManifest } from "./project-manifest.ts";
import { runStudyPreflight, type CommandRunner } from "./preflight.ts";

test("detects Java path shadowing and wrong dedicated Redis port", async () => {
  const root = await mkdtemp(join(tmpdir(), "preflight-"));
  await mkdir(join(root, "app"));
  await writeFile(join(root, "app", "gradlew"), "#!/bin/sh\n");
  await saveProjectManifest(root, {
    version: 1,
    projectSlug: "study-cache",
    topic: "Cache",
    environment: { runtimeVersion: "JDK 17", buildTool: "Gradle", sharedWorkspace: "app", services: [{ name: "study-redis", hostPort: 6380 }] },
    chapters: {},
  });
  const runner: CommandRunner = async (command) => {
    if (command === "java") return { code: 0, stdout: "openjdk 17.0.19", stderr: "" };
    if (command === "which") return { code: 0, stdout: "/usr/bin/java\n", stderr: "" };
    if (command.endsWith("gradlew")) return { code: 0, stdout: "", stderr: "" };
    if (command === "docker") return { code: 0, stdout: command, stderr: "" };
    return { code: 1, stdout: "", stderr: "unknown" };
  };
  const checks = await runStudyPreflight(root, async (command, args, cwd) => {
    if (command === "docker" && args[0] === "inspect") return { code: 0, stdout: '{"6379/tcp":[{"HostPort":"6379"}]}', stderr: "" };
    return runner(command, args, cwd);
  });
  assert.equal(checks.find((check) => check.id === "java-path")?.status, "warn");
  assert.equal(checks.find((check) => check.id === "service:study-redis")?.status, "fail");
});

test("passes configured environment", async () => {
  const root = await mkdtemp(join(tmpdir(), "preflight-ok-"));
  await mkdir(join(root, "app"));
  await writeFile(join(root, "app", "gradlew"), "#!/bin/sh\n");
  await saveProjectManifest(root, {
    version: 1,
    projectSlug: "study-cache",
    topic: "Cache",
    environment: { runtimeVersion: "17", buildTool: "Gradle", sharedWorkspace: "app", services: [{ name: "study-redis", hostPort: 6380 }] },
    chapters: {},
  });
  const checks = await runStudyPreflight(root, async (command, args) => {
    if (command === "java") return { code: 0, stdout: "openjdk version \"17.0.19\"", stderr: "" };
    if (command === "which") return { code: 0, stdout: "/home/me/.sdkman/java/bin/java\n", stderr: "" };
    if (command.endsWith("gradlew")) return { code: 0, stdout: "", stderr: "" };
    if (command === "docker" && args[0] === "inspect") return { code: 0, stdout: '{"6379/tcp":[{"HostPort":"6380"}]}', stderr: "" };
    if (command === "docker") return { code: 0, stdout: "27.0", stderr: "" };
    return { code: 1, stdout: "", stderr: "unknown" };
  });
  assert.equal(checks.some((check) => check.status === "fail"), false);
});
