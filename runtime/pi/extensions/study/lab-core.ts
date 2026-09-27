import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { projectPath } from "./project-path.ts";
import type { StudyPhaseStatus } from "./study-state.ts";

export type LabStepStatus = Extract<StudyPhaseStatus, "not_started" | "in_progress" | "completed" | "skipped_understood" | "blocked">;

export type LabStep = {
  id: string;
  title: string;
  status: LabStepStatus;
  learnerFiles?: string[];
  requiredArtifacts?: string[];
  verify?: {
    cwd?: string;
    command: string;
    expectedExitCode?: number;
    expectedTests?: number;
    outputIncludes?: string[];
  };
  skipEvidence?: string;
};

export type LabManifest = {
  version: 1;
  chapterSlug: string;
  mode: "cli" | "application" | "document" | "mixed";
  workspace?: string;
  steps: LabStep[];
};

export type LabVerification = {
  passed: boolean;
  stepId: string;
  status: LabStepStatus;
  command?: { exitCode: number; stdout: string; stderr: string; testCount?: number };
  missingFiles: string[];
  messages: string[];
};

export type LabResultInput = {
  observation: string;
  takeaway: string;
  verification: LabVerification;
  recordedAt?: string;
};

export type LabRunner = (command: string, args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export function labManifestPath(projectRoot: string, chapterSlug: string): string {
  return projectPath(projectRoot, chapterSlug, "lab", "manifest.json");
}

export async function loadLabManifest(projectRoot: string, chapterSlug: string): Promise<LabManifest> {
  return JSON.parse(await readFile(labManifestPath(projectRoot, chapterSlug), "utf8"));
}

export async function saveLabManifest(projectRoot: string, manifest: LabManifest): Promise<void> {
  const path = labManifestPath(projectRoot, manifest.chapterSlug);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

async function junitTestCount(workspace: string): Promise<number | undefined> {
  const dir = join(workspace, "build", "test-results", "test");
  let entries: string[];
  try { entries = await readdir(dir); } catch { return undefined; }
  let count = 0;
  for (const file of entries.filter((name) => name.endsWith(".xml"))) {
    const xml = await readFile(join(dir, file), "utf8");
    const suite = xml.match(/<testsuite[^>]*\stests="(\d+)"[^>]*>/);
    if (suite) count += Number(suite[1]);
  }
  return count;
}

export async function verifyLabStep(projectRoot: string, chapterSlug: string, stepId: string, runner: LabRunner): Promise<LabVerification> {
  const manifest = await loadLabManifest(projectRoot, chapterSlug);
  const step = manifest.steps.find((item) => item.id === stepId);
  if (!step) throw new Error(`lab step을 찾지 못했습니다: ${stepId}`);
  if (step.status === "skipped_understood") {
    const passed = Boolean(step.skipEvidence?.trim());
    return { passed, stepId, status: step.status, missingFiles: [], messages: passed ? [`스킵 근거: ${step.skipEvidence}`] : ["skipped_understood에는 skipEvidence가 필요합니다."] };
  }
  const required = [...(step.learnerFiles ?? []), ...(step.requiredArtifacts ?? [])];
  const missingFiles: string[] = [];
  for (const path of required) if (!(await exists(projectPath(projectRoot, path)))) missingFiles.push(path);
  const messages: string[] = missingFiles.length ? [`필수 파일 누락: ${missingFiles.join(", ")}`] : [];
  let commandResult: LabVerification["command"];
  if (step.verify) {
    const cwd = projectPath(projectRoot, step.verify.cwd ?? manifest.workspace ?? ".");
    const result = await runner("/bin/sh", ["-lc", step.verify.command], cwd);
    const testCount = await junitTestCount(cwd);
    commandResult = { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, ...(testCount != null ? { testCount } : {}) };
    const expectedExit = step.verify.expectedExitCode ?? 0;
    if (result.code !== expectedExit) messages.push(`검증 명령 exit code ${result.code}; expected ${expectedExit}`);
    if (step.verify.expectedTests != null && testCount !== step.verify.expectedTests) messages.push(`실제 테스트 수 ${testCount ?? 0}; expected ${step.verify.expectedTests}`);
    for (const expected of step.verify.outputIncludes ?? []) {
      if (!`${result.stdout}\n${result.stderr}`.includes(expected)) messages.push(`검증 출력에 필요한 문자열이 없습니다: ${expected}`);
    }
  }
  return { passed: messages.length === 0, stepId, status: step.status, command: commandResult, missingFiles, messages };
}

export async function recordLabResult(
  projectRoot: string,
  manifest: LabManifest,
  stepId: string,
  input: LabResultInput,
): Promise<void> {
  const step = manifest.steps.find((item) => item.id === stepId);
  if (!step) throw new Error(`lab step을 찾지 못했습니다: ${stepId}`);
  if (!input.verification.passed || input.verification.stepId !== stepId) throw new Error("실습 결과는 해당 step의 검증 통과 후에만 기록할 수 있습니다.");
  if (input.verification.status !== step.status) throw new Error("검증 시점의 step 상태와 현재 manifest 상태가 다릅니다. manifest를 다시 확인하세요.");
  if (!input.observation.trim()) throw new Error("관찰 결과를 입력해야 합니다.");
  if (!input.takeaway.trim()) throw new Error("배운 점을 입력해야 합니다.");

  const path = projectPath(projectRoot, manifest.chapterSlug, "lab", "results.md");
  await mkdir(dirname(path), { recursive: true });
  let existing = "";
  try { existing = await readFile(path, "utf8"); } catch { /* first result */ }
  const command = input.verification.command;
  const block = [
    `## ${step.title}`,
    "",
    `- Step ID: \`${stepId}\``,
    `- 기록 시각: ${input.recordedAt ?? new Date().toISOString()}`,
    `- 관찰: ${input.observation.trim()}`,
    `- 배운 점: ${input.takeaway.trim()} (학습자 설명; 독립적으로 검증된 사실은 아님)`,
    ...(input.verification.messages.length ? [`- 검증 메시지: ${input.verification.messages.join("; ")}`] : []),
    ...(step.status === "skipped_understood" ? [`- 스킵 근거: ${step.skipEvidence}`] : []),
    ...(command ? [
      `- 검증 명령 종료 코드: ${command.exitCode}`,
      ...(command.testCount != null ? [`- 실제 테스트 수: ${command.testCount}`] : []),
      ...(command.stdout.trim() ? [`- 표준 출력 요약: ${command.stdout.trim().split("\n").slice(-8).join(" | ")}`] : []),
      ...(command.stderr.trim() ? [`- 표준 오류 요약: ${command.stderr.trim().split("\n").slice(-5).join(" | ")}`] : []),
    ] : ["- 검증: manifest에 정의된 명령/산출물 검증 통과"]),
    ...(step.learnerFiles?.length ? [`- 확인 파일: ${step.learnerFiles.map((file) => `\`${file}\``).join(", ")}`] : []),
    ...(step.requiredArtifacts?.length ? [`- 산출물: ${step.requiredArtifacts.map((file) => `\`${file}\``).join(", ")}`] : []),
    "",
  ].join("\n");
  const marker = `- Step ID: \`${stepId}\``;
  if (existing.includes(marker)) return;
  const prefix = existing.trim() ? `${existing.trimEnd()}\n\n` : `# 실습 결과 기록 — ${manifest.chapterSlug}\n\n`;
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${prefix}${block}`, "utf8");
  await rename(temp, path);
}

export function updateLabStep(manifest: LabManifest, stepId: string, status: LabStepStatus, reason?: string): LabManifest {
  const step = manifest.steps.find((item) => item.id === stepId);
  if (!step) throw new Error(`lab step을 찾지 못했습니다: ${stepId}`);
  if (status === "skipped_understood" && !reason?.trim()) throw new Error("skipped_understood에는 근거가 필요합니다.");
  step.status = status;
  if (status === "skipped_understood") step.skipEvidence = reason!.trim();
  return manifest;
}
