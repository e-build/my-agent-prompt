import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { projectPath } from "./project-path.ts";

export type StudyPackScore = { score: number; maxScore: number; passScore: number };

async function readOptional(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); } catch { return ""; }
}

function hasPassedTest(content: string): boolean {
  const attempts = [...content.matchAll(/^## Attempt \d+[^\n]*$/gm)];
  const latestAttempt = attempts.length ? content.slice(attempts[attempts.length - 1].index) : content;
  return /\bPASSED\b|passed:\s*true|통과\s*여부:\s*(?:PASSED|통과)|총점\s*\d+\s*\/\s*\d+\s*→\s*통과|채점 결과:\s*\*\*\d+\s*\/\s*\d+\s*\(통과\)/i.test(latestAttempt)
    && !/미통과|재학습 필요|passed:\s*false/i.test(latestAttempt);
}

function section(title: string, content: string, emptyMessage: string): string {
  const body = content.trim();
  return `## ${title}\n\n${body || emptyMessage}\n`;
}

function conceptBodyFrom(readme: string): string {
  const match = readme.match(/##\s*개념 학습 노트\s*\n([\s\S]*?)(?=\n##\s|$)/);
  return match?.[1]?.trim() ?? "";
}

export async function buildStudyPack(projectRoot: string, chapterSlug: string, score?: StudyPackScore): Promise<string> {
  const chapterDir = projectPath(projectRoot, chapterSlug);
  const readmePath = join(chapterDir, "README.md");
  const readme = await readOptional(readmePath);
  if (!readme.trim()) throw new Error(`챕터 README.md가 없거나 비어 있습니다: ${chapterSlug}`);
  const conceptBody = conceptBodyFrom(readme);
  if (!conceptBody || /아직\s*개념\s*학습\s*전/.test(conceptBody)) throw new Error("챕터 README.md에 실제 학습 내용이 있는 개념 학습 노트가 있어야 합니다.");

  const test = await readOptional(join(chapterDir, "test.md"));
  if (!hasPassedTest(test)) throw new Error("챕터 학습 묶음은 통과한 test.md가 있어야 생성할 수 있습니다.");

  const diagnosis = await readOptional(join(chapterDir, "diagnosis.md"));
  const labResults = await readOptional(join(chapterDir, "lab", "results.md"));
  if (!labResults.trim()) throw new Error("챕터 학습 묶음을 만들려면 기록된 lab/results.md가 필요합니다.");
  const manifestText = await readOptional(join(chapterDir, "lab", "manifest.json"));
  if (!manifestText.trim()) throw new Error("챕터 학습 묶음에는 lab/manifest.json이 필요합니다.");
  let manifest: { steps?: Array<{ id?: string; status?: string; skipEvidence?: string }> };
  try { manifest = JSON.parse(manifestText); } catch { throw new Error("lab/manifest.json을 읽을 수 없습니다."); }
  if (!Array.isArray(manifest.steps)) throw new Error("lab/manifest.json에 steps 배열이 없습니다.");
  const unfinished = manifest.steps.filter((step) => !["completed", "skipped_understood"].includes(String(step.status)));
  if (unfinished.length) throw new Error(`완료되지 않은 lab step이 있습니다: ${unfinished.map((step) => step.id ?? "unknown").join(", ")}`);
  const missingResultSteps = manifest.steps.filter((step) => step.id && !labResults.includes(`- Step ID: \`${step.id}\``));
  const missingSkippedEvidence = manifest.steps.filter((step) => step.status === "skipped_understood" && (!step.skipEvidence?.trim() || !labResults.includes(`- 스킵 근거: ${step.skipEvidence}`)));
  if (missingResultSteps.length) throw new Error(`결과 기록이 없는 lab step이 있습니다: ${missingResultSteps.map((step) => step.id).join(", ")}`);
  if (missingSkippedEvidence.length) throw new Error(`근거 기록이 없는 skipped lab step이 있습니다: ${missingSkippedEvidence.map((step) => step.id).join(", ")}`);
  const review = await readOptional(join(chapterDir, "review", "learning-gaps.md"));
  const scoreLine = score
    ? `- 최종 테스트: ${score.score}/${score.maxScore} (통과 기준 ${score.passScore})\n`
    : "";
  const legacyConcept = await readOptional(join(chapterDir, "concept.md"));
  const reviewPackPath = projectPath(projectRoot, chapterSlug, "review", "study-pack.md");
  const existingPack = await readOptional(reviewPackPath);
  const previousRecall = existingPack.match(/## 복습 회상 기록[\s\S]*?(?=\n### Review 기록 원본|$)/)?.[0].trim();
  if (previousRecall && !/## 복습 회상 기록/.test(previousRecall)) throw new Error("기존 study-pack의 복습 회상 구역이 손상되어 자동 갱신을 중단했습니다.");
  const recallSection = previousRecall ?? "## 복습 회상 기록\n\n이 챕터를 다시 복습할 때 이 섹션에 회상 결과, 오개념 교정, 다음 복습 우선순위를 누적한다.";
  const recallHistory = (await Promise.all(["blank-recall.md", "gap-fill.md", "self-lecture.md", "analogy-lock.md", "schedule.md"].map(async (name) => {
    const value = await readOptional(join(chapterDir, "review", name));
    return value.trim() ? `### ${name.replace(/\.md$/, "")}\n\n${value.trim()}` : "";
  })))
    .filter(Boolean)
    .join("\n\n---\n\n");
  const content = [
    `# 복습 묶음 — ${chapterSlug}`,
    "",
    "> 이 문서는 챕터의 개념 본문과 실제 수행·평가 기록을 한곳에서 복습하기 위한 묶음이다. 원본 기록은 각 섹션의 링크를 참고한다.",
    "",
    "## 빠른 복습 안내",
    "",
    "1. 아래 개념 본문을 덮고 핵심 원리를 말로 재구성한다.",
    "2. 실습 기록의 관찰과 증거를 다시 확인한다.",
    "3. 초기 진단 약점과 최종 테스트 결과를 비교하고, 남은 학습 공백을 확인한다.",
    scoreLine.trimEnd(),
    "",
    section("개념 본문", conceptBody, "챕터 README.md에서 개념 본문이 비어 있다."),
    ...(legacyConcept.trim() ? ["", "### 기존 concept.md 호환 기록", "", legacyConcept.trim(), "", "원본: [기존 개념 노트](../concept.md)"] : []),
    `원본: [챕터 README](../README.md)`,
    "",
    section("실습 수행과 증거", labResults, "실습 결과 기록이 없다. lab/results.md를 확인하거나 누락된 실습 결과를 복원한다."),
    `원본: [실습 결과](../lab/results.md) · [실습 가이드](../lab/README.md)`,
    "",
    section("시작점 — 사전진단", diagnosis, "사전진단 기록이 없다."),
    `원본: [사전진단](../diagnosis.md)`,
    "",
    section("완료 평가", test, "통과한 테스트 기록이 없다."),
    `원본: [테스트 기록](../test.md)`,
    "",
    section("남은 학습 공백", review, "기록된 추가 학습 공백이 없다."),
    `원본: [학습 공백](learning-gaps.md)`,
    "",
    recallSection,
    ...(recallHistory ? ["### Review 기록 원본", "", recallHistory] : []),
    "",
  ].join("\n");
  await mkdir(dirname(reviewPackPath), { recursive: true });
  await writeFile(reviewPackPath, content, "utf8");
  return reviewPackPath;
}
