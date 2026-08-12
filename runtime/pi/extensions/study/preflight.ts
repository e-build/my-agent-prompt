import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProjectManifest, type StudyProjectManifest } from "./project-manifest.ts";
import { projectPath } from "./project-path.ts";

export type PreflightCheck = {
  id: string;
  status: "ok" | "warn" | "fail";
  summary: string;
  evidence?: string;
  remediation?: string;
};

export type CommandRunner = (command: string, args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function versionNumber(text: string): string | null {
  return text.match(/(?:openjdk|java) version\s+"?([\d.]+)/i)?.[1] ?? text.match(/version\s+([\d.]+)/i)?.[1] ?? null;
}

function expectedJava(manifest: StudyProjectManifest | null): string | null {
  const raw = manifest?.environment?.runtimeVersion ?? "";
  return raw.match(/\d+/)?.[0] ?? null;
}

export async function runStudyPreflight(projectRoot: string, runner: CommandRunner): Promise<PreflightCheck[]> {
  const manifest = await loadProjectManifest(projectRoot);
  const checks: PreflightCheck[] = [];
  const workspace = projectPath(projectRoot, manifest?.environment?.sharedWorkspace ?? ".");

  const java = await runner("java", ["--version"], workspace);
  if (java.code !== 0) {
    checks.push({ id: "java", status: "fail", summary: "Java를 실행할 수 없음", evidence: java.stderr || java.stdout, remediation: "현재 셸의 JAVA_HOME과 PATH를 확인하세요." });
  } else {
    const actual = versionNumber(`${java.stdout}\n${java.stderr}`);
    const expected = expectedJava(manifest);
    checks.push({
      id: "java",
      status: expected && actual?.split(".")[0] !== expected ? "fail" : "ok",
      summary: expected ? `Java ${actual ?? "?"} / expected ${expected}` : `Java ${actual ?? "확인됨"}`,
      evidence: java.stdout || java.stderr,
      ...(expected && actual?.split(".")[0] !== expected ? { remediation: `프로젝트 runtimeVersion ${expected}에 맞는 JDK를 활성화하세요.` } : {}),
    });
  }

  const which = await runner("which", ["java"], workspace);
  const javaPath = which.stdout.trim();
  checks.push({
    id: "java-path",
    status: javaPath === "/usr/bin/java" && manifest?.environment?.runtimeVersion ? "warn" : which.code === 0 ? "ok" : "warn",
    summary: javaPath ? `실행 Java: ${javaPath}` : "Java 실행 경로 확인 불가",
    evidence: javaPath,
    ...(javaPath === "/usr/bin/java" ? { remediation: "SDKMAN/Homebrew JDK를 사용한다면 해당 JAVA_HOME/bin이 PATH 앞에 있는지 확인하세요." } : {}),
  });

  const wrapper = join(workspace, "gradlew");
  if (manifest?.environment?.buildTool?.toLowerCase().includes("gradle")) {
    if (!(await exists(wrapper))) {
      checks.push({ id: "gradle", status: "fail", summary: `Gradle wrapper 없음: ${wrapper}`, remediation: "공통 workspace에 gradlew를 생성하세요." });
    } else {
      const gradle = await runner(wrapper, ["test", "--dry-run"], workspace);
      checks.push({ id: "gradle", status: gradle.code === 0 ? "ok" : "fail", summary: gradle.code === 0 ? "Gradle wrapper 실행 가능" : "Gradle wrapper 실행 실패", evidence: gradle.stderr || gradle.stdout });
    }
  }

  const docker = await runner("docker", ["info", "--format", "{{.ServerVersion}}"], workspace);
  checks.push({ id: "docker", status: docker.code === 0 ? "ok" : "fail", summary: docker.code === 0 ? `Docker ${docker.stdout.trim()}` : "Docker daemon 사용 불가", evidence: docker.stderr });

  for (const service of manifest?.environment?.services ?? []) {
    const inspect = await runner("docker", ["inspect", service.name, "--format", "{{json .NetworkSettings.Ports}}"], workspace);
    if (inspect.code !== 0) {
      checks.push({ id: `service:${service.name}`, status: "fail", summary: `전용 서비스 컨테이너 없음: ${service.name}`, evidence: inspect.stderr, remediation: `SETUP.md 기준으로 ${service.name}을 먼저 실행하세요.` });
      continue;
    }
    const expectedPort = service.hostPort;
    const evidence = inspect.stdout.trim();
    const portOk = expectedPort == null || evidence.includes(`\"HostPort\":\"${expectedPort}\"`);
    checks.push({
      id: `service:${service.name}`,
      status: portOk ? "ok" : "fail",
      summary: portOk ? `${service.name} 전용 포트 확인` : `${service.name} host port가 ${expectedPort}가 아님`,
      evidence,
      ...(!portOk ? { remediation: `운영/개발 기본 포트 대신 전용 host port ${expectedPort}를 사용하세요.` } : {}),
    });
  }

  try {
    const setup = await readFile(join(projectRoot, "SETUP.md"), "utf8");
    if (/운영.*금지|개발.*금지|실제 고객.*금지/.test(setup)) checks.push({ id: "safety-doc", status: "ok", summary: "SETUP.md 안전 가드 확인" });
  } catch { /* optional */ }
  return checks;
}
