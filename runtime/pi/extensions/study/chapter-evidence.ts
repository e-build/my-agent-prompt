import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectPath } from "./project-path.ts";

async function readOptional(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); } catch { return ""; }
}

function hasPassedTest(content: string): boolean {
  const attempts = [...content.matchAll(/^## Attempt \d+[^\n]*$/gm)];
  const latestAttempt = attempts.length ? content.slice(attempts[attempts.length - 1].index) : content;
  return /\bPASSED\b|passed:\s*true|통과\s*여부:\s*(?:PASSED|통과)|총점\s*\d+\s*\/\s*\d+\s*→\s*통과|채점 결과:\s*\*\*\d+\s*\/\s*\d+\s*\(통과\)/i.test(latestAttempt)
    && !/미통과|재학습 필요|passed:\s*false/i.test(latestAttempt);
}

function conceptBodyFrom(readme: string): string {
  const match = readme.match(/##\s*개념 학습 노트\s*\n([\s\S]*?)(?=\n##\s|$)/);
  return match?.[1]?.trim() ?? "";
}

export type LabRecordGaps = {
  unfinishedSteps: string[];
  missingResultSteps: string[];
  missingSkippedEvidence: string[];
};

export async function findLabRecordGaps(projectRoot: string, chapterSlug: string): Promise<LabRecordGaps | null> {
  const chapterDir = projectPath(projectRoot, chapterSlug);
  const manifestText = await readOptional(join(chapterDir, "lab", "manifest.json"));
  if (!manifestText.trim()) return null;
  let manifest: { steps?: Array<{ id?: string; status?: string; skipEvidence?: string }> };
  try { manifest = JSON.parse(manifestText); } catch { return null; }
  if (!Array.isArray(manifest.steps)) return null;
  const labResults = await readOptional(join(chapterDir, "lab", "results.md"));
  const doneSteps = manifest.steps.filter((step) => ["completed", "skipped_understood"].includes(String(step.status)));
  return {
    unfinishedSteps: manifest.steps
      .filter((step) => !["completed", "skipped_understood"].includes(String(step.status)))
      .map((step) => step.id ?? "unknown"),
    missingResultSteps: doneSteps
      .filter((step) => step.id && !labResults.includes(`- Step ID: \`${step.id}\``))
      .map((step) => step.id!),
    missingSkippedEvidence: doneSteps
      .filter((step) => step.status === "skipped_understood" && (!step.skipEvidence?.trim() || !labResults.includes(`- 스킵 근거: ${step.skipEvidence}`)))
      .map((step) => step.id!),
  };
}

export async function validateChapterEvidence(projectRoot: string, chapterSlug: string): Promise<void> {
  const chapterDir = projectPath(projectRoot, chapterSlug);
  const readmePath = join(chapterDir, "README.md");
  const readme = await readOptional(readmePath);
  if (!readme.trim()) throw new Error(`챕터 README.md가 없거나 비어 있습니다: ${chapterSlug}`);
  const conceptBody = conceptBodyFrom(readme);
  if (!conceptBody || /아직\s*개념\s*학습\s*전/.test(conceptBody)) throw new Error("챕터 README.md에 실제 학습 내용이 있는 개념 학습 노트가 있어야 합니다.");

  const test = await readOptional(join(chapterDir, "test.md"));
  if (!hasPassedTest(test)) throw new Error("챕터 완료 검증에는 통과한 test.md가 필요합니다.");

  const labResults = await readOptional(join(chapterDir, "lab", "results.md"));
  if (!labResults.trim()) throw new Error("챕터 완료 검증에는 기록된 lab/results.md가 필요합니다.");
  const gaps = await findLabRecordGaps(projectRoot, chapterSlug);
  if (!gaps) {
    const manifestText = await readOptional(join(chapterDir, "lab", "manifest.json"));
    if (!manifestText.trim()) throw new Error("챕터 완료 검증에는 lab/manifest.json이 필요합니다.");
    throw new Error("lab/manifest.json을 읽을 수 없습니다.");
  }
  if (gaps.unfinishedSteps.length) throw new Error(`완료되지 않은 lab step이 있습니다: ${gaps.unfinishedSteps.join(", ")}`);
  if (gaps.missingResultSteps.length) throw new Error(`결과 기록이 없는 lab step이 있습니다: ${gaps.missingResultSteps.join(", ")}`);
  if (gaps.missingSkippedEvidence.length) throw new Error(`근거 기록이 없는 skipped lab step이 있습니다: ${gaps.missingSkippedEvidence.join(", ")}`);
}
