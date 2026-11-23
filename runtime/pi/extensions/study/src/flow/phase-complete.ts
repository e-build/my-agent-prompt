import { readdir, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadLabManifest } from "../lab/lab-core.ts";
import { projectPath } from "../state/project-path.ts";
import type { StudyPhase } from "../state/study-state.ts";

export type CompletionCheck = { ok: true } | { ok: false; problems: string[] };

export async function conceptFiles(projectRoot: string, chapterSlug: string): Promise<string[]> {
  try {
    return (await readdir(projectPath(projectRoot, chapterSlug, "concepts"), { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function conceptLinks(readme: string): string[] | null {
  const section = readme.match(/^## 개념 파일[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!section) return null;
  return [...section[1].matchAll(/\]\((?:\.\/)?concepts\/([^)\s#]+\.md)\)/g)]
    .map((m) => basename(decodeURIComponent(m[1])))
    .sort();
}

async function checkConcept(projectRoot: string, chapterSlug: string): Promise<CompletionCheck> {
  const files = await conceptFiles(projectRoot, chapterSlug);
  const readme = await readFile(projectPath(projectRoot, chapterSlug, "README.md"), "utf8").catch(() => "");
  const links = conceptLinks(readme);
  const problems: string[] = [];
  if (!files.length) problems.push(`개념 파일이 없습니다: ${chapterSlug}/concepts/*.md`);
  if (links === null) problems.push(`${chapterSlug}/README.md에 \`## 개념 파일\` 섹션이 없습니다.`);
  else {
    const missing = files.filter((f) => !links.includes(f));
    const extra = links.filter((l) => !files.includes(l));
    if (missing.length) problems.push(`README 목록에 없는 개념 파일: ${missing.join(", ")}`);
    if (extra.length) problems.push(`README가 가리키지만 없는 파일: ${extra.join(", ")}`);
  }
  return problems.length ? { ok: false, problems } : { ok: true };
}

async function checkLab(projectRoot: string, chapterSlug: string): Promise<CompletionCheck> {
  let manifest;
  try {
    manifest = await loadLabManifest(projectRoot, chapterSlug);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!manifest) return { ok: false, problems: [`${chapterSlug}/lab/manifest.json이 없습니다.`] };
  const open = manifest.steps.filter((s) => !["completed", "skipped_understood"].includes(s.status));
  return open.length
    ? { ok: false, problems: [`끝나지 않은 lab step: ${open.map((s) => s.id).join(", ")}`] }
    : { ok: true };
}

export async function checkPhaseComplete(
  projectRoot: string,
  chapterSlug: string,
  phase: StudyPhase,
): Promise<CompletionCheck> {
  if (phase === "concept") return checkConcept(projectRoot, chapterSlug);
  if (phase === "lab") return checkLab(projectRoot, chapterSlug);
  throw new Error(
    phase === "test"
      ? "시험은 study_test_finish로 끝냅니다."
      : "복습 회차는 study_review_finish로 기록합니다.",
  );
}
