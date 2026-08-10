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

export function updateLabStep(manifest: LabManifest, stepId: string, status: LabStepStatus, reason?: string): LabManifest {
  const step = manifest.steps.find((item) => item.id === stepId);
  if (!step) throw new Error(`lab step을 찾지 못했습니다: ${stepId}`);
  if (status === "skipped_understood" && !reason?.trim()) throw new Error("skipped_understood에는 근거가 필요합니다.");
  step.status = status;
  if (status === "skipped_understood") step.skipEvidence = reason!.trim();
  return manifest;
}
