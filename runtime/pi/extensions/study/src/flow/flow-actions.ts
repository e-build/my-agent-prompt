import { basename, dirname, join, relative } from "node:path";
import { CONFIDENCE_ITEM, readScope, type Scope } from "../cards/card-store.ts";
import { localDate } from "../review/review-date.ts";
import { due, enroll, loadSchedule, recordRound } from "../review/schedule.ts";
import { findWorkspaceRoot, initWorkspace, registerProject } from "../review/workspace.ts";
import {
  loadProjectManifest,
  parsePlacement,
  saveProjectManifest,
  type StudyProjectManifest,
} from "../state/project-manifest.ts";
import { loadStudyState, saveStudyState, setPhase, type StudyPhase } from "../state/study-state.ts";
import { checkPhaseComplete, conceptFiles } from "./phase-complete.ts";
import { computeTestResult } from "./test-result.ts";

export const PLACEMENT_LIMIT = 8;
const NEXT: Record<StudyPhase, string> = {
  concept: "실습(/study-chapter)",
  lab: "시험(/study-chapter)",
  test: "복습(/study-review, 예정일에)",
  review: "다음 챕터(/study-chapter)",
};

export function todayIn(timezone: string | undefined): string {
  return localDate(new Date(), timezone ?? "Asia/Seoul");
}

function answerReview(scope: Scope): string {
  const lines = ["## 답 대조", ""];
  for (const stored of Object.values(scope.cards)) {
    if (stored.card.kind !== "question") continue;
    const confidence = scope.answers.find((a) => a.cardId === stored.card.id && a.itemId === CONFIDENCE_ITEM);
    for (const item of stored.card.items) {
      const answer = scope.answers.find((a) => a.cardId === stored.card.id && a.itemId === item.id && !a.correctionOf);
      const level = answer?.confidence ?? (confidence ? Number(confidence.response) / 10 : undefined);
      lines.push(
        `- ${item.prompt} [${stored.card.id}/${item.id}]`,
        `  - 내 답: ${answer ? answer.response : "(미응답)"}`,
        `  - 확신도 ${level === undefined || Number.isNaN(level) ? "없음" : Math.round(level * 10)} · 판정 ${answer?.result ?? "unverified"}`,
        `  - 정답: ${stored.criteria?.[item.id]?.answer ?? "?"}`,
      );
    }
  }
  return lines.join("\n");
}

export async function finishPlacement(projectRoot: string, input: unknown): Promise<string> {
  const scope = await readScope(projectRoot, "placement");
  const count = Object.values(scope.cards).filter((c) => c.card.kind === "question").length;
  const placement = parsePlacement({ ...(input as object), questionCount: count });
  if (count > PLACEMENT_LIMIT && placement.reason !== "limit_reached")
    throw new Error(`배치 진단 질문이 ${count}개로 상한 ${PLACEMENT_LIMIT}개를 넘었습니다. reason=limit_reached로 끝내세요.`);
  const manifest: StudyProjectManifest = (await loadProjectManifest(projectRoot)) ?? {
    version: 1,
    projectSlug: basename(projectRoot),
    topic: "",
    chapters: {},
  };
  await saveProjectManifest(projectRoot, { ...manifest, placement });
  return [
    `배치 진단 저장(${placement.reason}, 질문 ${count}개, 챕터 출발점 ${Object.keys(placement.chapters).length}개).`,
    "",
    answerReview(scope),
  ].join("\n");
}

/** Learner approved the curriculum: write the manifest, register in the study root, create state. */
export async function approveProject(
  projectRoot: string,
  input: Pick<StudyProjectManifest, "projectSlug" | "topic" | "chapters" | "environment">,
): Promise<string> {
  const existing = await loadProjectManifest(projectRoot);
  await saveProjectManifest(projectRoot, {
    ...(existing ?? {}),
    version: 1,
    projectSlug: input.projectSlug,
    topic: input.topic,
    chapters: input.chapters,
    ...(input.environment ? { environment: input.environment } : {}),
  });
  const workspace = (await findWorkspaceRoot(projectRoot)) ?? (await initWorkspace(dirname(projectRoot)));
  await registerProject(workspace.root, {
    slug: input.projectSlug,
    path: relative(workspace.root, projectRoot).split("\\").join("/"),
  });
  await saveStudyState(projectRoot, await loadStudyState(projectRoot));
  return `study 루트(${workspace.root})에 ${input.projectSlug}를 등록했습니다.`;
}

export async function completePhase(
  projectRoot: string,
  chapterSlug: string,
  phase: StudyPhase,
): Promise<string> {
  const check = await checkPhaseComplete(projectRoot, chapterSlug, phase);
  if (!check.ok) throw new Error(`${phase}를 끝낼 수 없습니다:\n- ${check.problems.join("\n- ")}`);
  await setPhase(projectRoot, chapterSlug, phase, "completed");
  return `${chapterSlug} ${phase} 완료. 다음: ${NEXT[phase]}`;
}

export async function finishTest(
  projectRoot: string,
  input: { chapterSlug: string; cardId: string; passScore: number },
  today?: string,
): Promise<string> {
  const result = computeTestResult(await readScope(projectRoot, input.chapterSlug), input.cardId, input.passScore);
  const state = await loadStudyState(projectRoot);
  const attempt = (state.chapters[input.chapterSlug]?.test.attempt ?? 0) + 1;
  const score = { attempt, score: result.total, maxScore: result.max };
  if (!result.passed) {
    await setPhase(projectRoot, input.chapterSlug, "test", "relearn_required", score);
    return [
      `미통과 ${result.total}/${result.max} (기준 ${result.passScore}).`,
      `약점 문항: ${result.weak.join(", ")}`,
      `약점에 해당하는 개념만 다시 다룬 뒤, 새 카드 ID로 변형 문항을 만들어 attempt ${attempt + 1}을 진행하세요.`,
    ].join("\n");
  }
  await setPhase(projectRoot, input.chapterSlug, "test", "completed", score);
  const workspace = await findWorkspaceRoot(projectRoot);
  if (!workspace)
    return `통과 ${result.total}/${result.max}. study 루트가 없어 복습 일정은 등록하지 않았습니다.`;
  const manifest = await loadProjectManifest(projectRoot);
  const date = today ?? todayIn(workspace.timezone);
  const entry = await enroll(
    workspace.root,
    { projectSlug: manifest?.projectSlug ?? basename(projectRoot), chapterSlug: input.chapterSlug },
    date,
    workspace.review.intervals,
  );
  await setPhase(projectRoot, input.chapterSlug, "review", "in_progress");
  return `통과 ${result.total}/${result.max}. 첫 복습 예정일: ${entry.due}${result.weak.length ? ` (약점 문항: ${result.weak.join(", ")})` : ""}`;
}

async function projectRootOf(root: string, slug: string): Promise<string | undefined> {
  const workspace = await findWorkspaceRoot(root);
  const project = workspace?.projects.find((p) => p.slug === slug);
  return project ? join(root, project.path) : undefined;
}

function lastWeak(scope: Scope): string[] {
  const tests = Object.values(scope.cards).filter((c) => c.card.kind === "question" && c.card.purpose === "test");
  for (const stored of tests.reverse()) {
    try {
      return computeTestResult(scope, stored.card.id, 0).weak;
    } catch {
      continue;
    }
  }
  return [];
}

export async function reviewNext(
  root: string,
  today: string,
  filter: { projectSlug?: string; chapterSlug?: string } = {},
): Promise<string> {
  const entries = await due(root, today, filter);
  if (!entries.length) {
    const upcoming = (await loadSchedule(root)).entries
      .filter((e) => e.due !== null)
      .map((e) => e.due!)
      .sort()[0];
    return `오늘(${today}) 할 복습이 없습니다.${upcoming ? ` 다음 예정일: ${upcoming}` : ""}`;
  }
  const lines = [`## 오늘 할 복습 (${today})`, ""];
  for (const entry of entries) {
    lines.push(`- ${entry.projectSlug} / ${entry.chapterSlug} · ${entry.round}회차 · 예정일 ${entry.due}`);
    const projectRoot = await projectRootOf(root, entry.projectSlug);
    if (!projectRoot) {
      lines.push("  - 프로젝트를 study 루트에서 찾지 못했습니다.");
      continue;
    }
    const files = await conceptFiles(projectRoot, entry.chapterSlug);
    lines.push(`  - 개념 파일: ${files.map((f) => `${entry.chapterSlug}/concepts/${f}`).join(", ") || "없음"}`);
    const weak = lastWeak(await readScope(projectRoot, entry.chapterSlug));
    if (weak.length) lines.push(`  - 지난 시험 약점: ${weak.join(", ")}`);
  }
  return lines.join("\n");
}

export async function finishReview(
  projectRoot: string,
  input: { chapterSlug: string; cardId: string },
  today?: string,
): Promise<string> {
  const workspace = await findWorkspaceRoot(projectRoot);
  if (!workspace) throw new Error("등록된 study 루트가 없어 복습 일정을 기록할 수 없습니다.");
  const scope = await readScope(projectRoot, input.chapterSlug);
  const stored = scope.cards[input.cardId];
  if (!stored || stored.card.kind !== "question" || stored.card.purpose !== "review")
    throw new Error(`복습 카드를 찾지 못했습니다: ${input.cardId}`);
  const firsts = stored.card.items.map((item) => ({
    item: item.id,
    answer: scope.answers.find((a) => a.cardId === input.cardId && a.itemId === item.id && !a.correctionOf),
  }));
  const missing = firsts.filter((f) => !f.answer).map((f) => f.item);
  if (missing.length) throw new Error(`응답이 기록되지 않은 문항: ${missing.join(", ")}`);
  const clean = firsts.every((f) => f.answer!.assistance === "independent" && f.answer!.result === "demonstrated");
  const manifest = await loadProjectManifest(projectRoot);
  const entry = await recordRound(
    workspace.root,
    { projectSlug: manifest?.projectSlug ?? basename(projectRoot), chapterSlug: input.chapterSlug },
    { date: today ?? todayIn(workspace.timezone), result: clean ? "advanced" : "reset", cardId: input.cardId },
    workspace.review.intervals,
  );
  if (entry.due === null) {
    await setPhase(projectRoot, input.chapterSlug, "review", "completed");
    return `${input.chapterSlug} 복습을 마쳤습니다(마지막 회차).`;
  }
  return clean
    ? `다음 회차(${entry.round}회차) 예정일: ${entry.due}`
    : `독립 회상이 아닌 문항이 있어 처음 간격부터 다시 합니다. 다음 예정일: ${entry.due}`;
}
