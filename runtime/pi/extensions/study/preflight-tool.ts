import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolve } from "node:path";
import { findStudyProjectRoot } from "./project-root.ts";
import { runStudyPreflight } from "./preflight.ts";
import { createCommandRunner } from "./command-runner.ts";

export function registerPreflightTool(pi: ExtensionAPI) {
  const runCommand = createCommandRunner(pi);
  pi.registerTool({
    name: "study_preflight",
    label: "Study Preflight",
    description:
      "학습 프로젝트 manifest를 기준으로 Java/Gradle/Docker/전용 서비스 포트를 검사합니다. lab 시작 전에 실행하세요.",
    promptSnippet:
      "Verify the study project's runtime, build tool, Docker, and dedicated services before lab",
    parameters: Type.Object({
      projectRoot: Type.Optional(
        Type.String({ description: "학습 프로젝트 루트. 생략하면 현재 cwd에서 찾습니다." }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd ?? process.cwd();
      const projectRoot = params.projectRoot
        ? resolve(cwd, params.projectRoot)
        : await findStudyProjectRoot(cwd);
      const checks = await runStudyPreflight(projectRoot, runCommand);
      const lines = checks.map(
        (check) =>
          `[${check.status.toUpperCase()}] ${check.summary}${check.evidence ? `\n  evidence: ${check.evidence.trim()}` : ""}${check.remediation ? `\n  해결: ${check.remediation}` : ""}`,
      );
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { projectRoot, checks, passed: !checks.some((check) => check.status === "fail") },
      };
    },
  });
}
