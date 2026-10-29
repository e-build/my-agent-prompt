import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { findStudyProjectRoot } from "./project-root.ts";
import { projectPath } from "./project-path.ts";
import { manifestFromCurriculum, saveProjectManifest } from "./project-manifest.ts";

export type CurriculumArtifactParams = {
  projectSlug: string;
  projectRoot?: string;
  topic: string;
  curriculumJson: string;
};

export async function resolveCurriculumRoot(
  cwd: string,
  params: CurriculumArtifactParams,
): Promise<string> {
  return findStudyProjectRoot(cwd, {
    projectSlug: params.projectSlug,
    projectRoot: params.projectRoot,
    allowCreate: true,
  });
}

export async function writeCurriculumArtifacts(
  cwd: string,
  params: CurriculumArtifactParams,
  template: string,
): Promise<{ projectRoot: string; htmlPath: string }> {
  let payload: unknown;
  try {
    payload = JSON.parse(params.curriculumJson);
  } catch (error) {
    throw new Error(
      `curriculumJson이 올바른 JSON이 아닙니다: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (
    payload &&
    typeof payload === "object" &&
    "projectSlug" in payload &&
    payload.projectSlug !== params.projectSlug
  ) {
    throw new Error("curriculumJson의 projectSlug와 도구 인자가 일치하지 않습니다.");
  }
  const projectRoot = await resolveCurriculumRoot(cwd, params);
  const htmlPath = projectPath(projectRoot, "curriculum.html");
  const manifest = manifestFromCurriculum(payload, params.projectSlug, params.topic);
  const html = template
    .replace(/{{PROJECT_SLUG}}/g, escapeForHtml(params.projectSlug))
    .replace(/{{TOPIC}}/g, escapeForHtml(params.topic))
    .replace("{{CURRICULUM_JSON}}", () => params.curriculumJson);
  await saveProjectManifest(projectRoot, manifest);
  await mkdir(dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, html, "utf8");
  return { projectRoot, htmlPath };
}

function escapeForHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
