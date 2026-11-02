/**
 * File storage for the placement diagnosis. Lives in the project directory
 * because the project is not registered yet; every write is a hash-checked
 * atomic replace so a concurrent change is never overwritten.
 */
import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { currentSha256, readTextOptional, writeFileAtomic } from "../workspace/atomic-file.ts";
import { safeProjectWritePath } from "../workspace/safe-path.ts";
import type { DiagnosisEndReason, LearningRoute } from "../session/dialogue-state.ts";
import {
  addPlacementQuestion,
  createPlacement,
  finishPlacement,
  publicPlacement,
  recordPlacementAnswer,
  restorePlacement,
  type PlacementAnswerInput,
  type PlacementQuestionInput,
  type PlacementRun,
  type PlacementStrand,
  type PublicPlacement,
  type PublicPlacementQuestion,
} from "./placement-state.ts";

export const PLACEMENT_FILE = ".study/placement.json";

function requireAbsolute(projectRoot: string): string {
  if (typeof projectRoot !== "string" || !isAbsolute(projectRoot)) throw new Error(`projectRoot는 절대 경로여야 합니다: ${projectRoot}`);
  return projectRoot;
}

async function placementPath(projectRoot: string): Promise<string> {
  return safeProjectWritePath(requireAbsolute(projectRoot), PLACEMENT_FILE);
}

/** Read-only. Missing file → null; corrupt file → error, never recreated. */
export async function loadPlacement(projectRoot: string): Promise<PlacementRun | null> {
  const path = await placementPath(projectRoot);
  const content = await readTextOptional(path);
  if (content === null) return null;
  return restorePlacement(content);
}

async function update(
  projectRoot: string,
  transition: (current: PlacementRun | null) => PlacementRun,
): Promise<PlacementRun> {
  const path = await placementPath(projectRoot);
  const content = await readTextOptional(path);
  const current = content === null ? null : restorePlacement(content);
  const next = transition(current);
  if (current && JSON.stringify(current) === JSON.stringify(next)) return next;
  const expectedSha256 = await currentSha256(path);
  await writeFileAtomic(path, `${JSON.stringify(next, null, 2)}\n`, { expectedSha256 });
  return next;
}

export async function startPlacement(
  projectRoot: string,
  args: { projectSlug: string; strands: PlacementStrand[]; limit?: number },
  now = () => new Date().toISOString(),
): Promise<PublicPlacement> {
  const run = await update(projectRoot, (current) => {
    if (current?.status === "open") throw new Error("진행 중인 배치 진단이 있습니다. 먼저 종료하세요.");
    return createPlacement({ id: `pl-${randomUUID()}`, projectSlug: args.projectSlug, strands: args.strands, limit: args.limit, at: now() });
  });
  return publicPlacement(run);
}

export async function preparePlacementQuestion(
  projectRoot: string,
  input: Omit<PlacementQuestionInput, "at">,
  now = () => new Date().toISOString(),
): Promise<PublicPlacementQuestion> {
  const at = now();
  const run = await update(projectRoot, (current) => {
    if (!current) throw new Error("배치 진단을 먼저 시작하세요(start).");
    return addPlacementQuestion(current, { ...input, at });
  });
  const stored = run.questions.find((q) => q.requestId === input.requestId)!;
  return publicPlacement({ ...run, questions: [stored] }).questions[0];
}

export async function recordPlacementAnswerRun(
  projectRoot: string,
  input: Omit<PlacementAnswerInput, "at">,
  now = () => new Date().toISOString(),
): Promise<PublicPlacement> {
  const at = now();
  const run = await update(projectRoot, (current) => {
    if (!current) throw new Error("배치 진단을 먼저 시작하세요(start).");
    return recordPlacementAnswer(current, { ...input, at });
  });
  return publicPlacement(run);
}

export async function finishPlacementRun(
  projectRoot: string,
  args: { reason: DiagnosisEndReason; route?: LearningRoute; unverified?: string[] },
  now = () => new Date().toISOString(),
): Promise<PublicPlacement> {
  const at = now();
  const run = await update(projectRoot, (current) => {
    if (!current) throw new Error("진행 중인 배치 진단이 없습니다.");
    return finishPlacement(current, { reason: args.reason, route: args.route, unverified: args.unverified ?? [], at });
  });
  return publicPlacement(run);
}
