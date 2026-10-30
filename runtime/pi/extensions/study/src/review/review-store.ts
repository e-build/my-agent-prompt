import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Evidence, StoredQuestion } from "../evidence/evidence-types.ts";
import { validateKnowledgeId } from "../knowledge/knowledge-validation.ts";
import { readTextOptional, sha256 } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan, type PlannedChange } from "../workspace/change-plan.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import { localDate } from "./review-date.ts";
import { advanceReview, createSchedule, type ReviewSchedule } from "./review-schedule.ts";

export const SCHEDULE_DIR = "review/items";
export const schedulePath = (knowledgeId: string) => `${SCHEDULE_DIR}/${validateKnowledgeId(knowledgeId)}.json`;

export function encodeSchedule(schedule: ReviewSchedule): string {
  return `${JSON.stringify(schedule, null, 2)}\n`;
}

export async function loadSchedule(root: string, knowledgeId: string): Promise<ReviewSchedule | null> {
  const relative = schedulePath(knowledgeId);
  const content = await readTextOptional(join(root, ...relative.split("/")));
  if (content === null) return null;
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`복습 일정 파일이 손상됐습니다: ${relative}`);
  }
}

export async function listSchedules(root: string): Promise<ReviewSchedule[]> {
  let names: string[];
  try {
    names = await readdir(join(root, "review", "items"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const schedules: ReviewSchedule[] = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    const schedule = await loadSchedule(root, name.slice(0, -5));
    if (schedule) schedules.push(schedule);
  }
  return schedules;
}

/** Save one schedule only if it is unchanged since `expected` was read. */
export async function saveSchedule(root: string, next: ReviewSchedule, expected: ReviewSchedule | null): Promise<void> {
  const relative = schedulePath(next.knowledgeId);
  const current = await loadSchedule(root, next.knowledgeId);
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error(`다른 변경이 먼저 저장됐습니다: ${relative}`);
  const plan = await preparePlan(root, `schedule-${next.knowledgeId}-${sha256(encodeSchedule(next)).slice(0, 12)}`, [
    { path: relative, after: encodeSchedule(next) },
  ]);
  await executePlan(root, plan);
}

/**
 * Create the first schedule for each proposition from the chapter completion
 * date. Existing schedules (active, completed or merged) are left alone.
 */
export async function scheduleRegistrationChanges(
  root: string,
  args: { knowledgeIds: string[]; completedOn: string; origin: { projectId: string; chapterSlug: string } },
): Promise<{ changes: PlannedChange[]; created: string[]; existing: string[] }> {
  const workspace = await readWorkspace(root);
  const created: string[] = [];
  const existing: string[] = [];
  const changes: PlannedChange[] = [];
  for (const id of [...new Set(args.knowledgeIds)]) {
    if (await loadSchedule(root, id)) {
      existing.push(id);
      continue;
    }
    const schedule = createSchedule({
      knowledgeId: id,
      completedOn: args.completedOn,
      intervals: workspace.manifest.review.intervals,
      timezone: workspace.manifest.timezone,
      origin: args.origin,
    });
    changes.push({ path: schedulePath(id), after: encodeSchedule(schedule) });
    created.push(id);
  }
  return { changes, created, existing };
}

export async function registerSchedules(
  root: string,
  args: Parameters<typeof scheduleRegistrationChanges>[1],
): Promise<{ created: string[]; existing: string[] }> {
  const { changes, created, existing } = await scheduleRegistrationChanges(root, args);
  if (changes.length) {
    const plan = await preparePlan(root, `schedule-register-${sha256(JSON.stringify([args.origin, created, args.completedOn])).slice(0, 24)}`, changes);
    await executePlan(root, plan);
  }
  return { created, existing };
}

/** Schedule updates committed in the same change as a review answer. */
export async function reviewScheduleChanges(
  root: string,
  evidence: Evidence,
  question: StoredQuestion,
): Promise<PlannedChange[]> {
  if (question.purpose !== "review") return [];
  const workspace = await readWorkspace(root);
  const day = localDate(evidence.submittedAt, workspace.manifest.timezone);
  const changes: PlannedChange[] = [];
  for (const finding of evidence.findings) {
    const schedule = await loadSchedule(root, finding.ref.id);
    if (!schedule || schedule.status !== "active") continue;
    const next = advanceReview(schedule, {
      evidenceId: evidence.id,
      localDate: day,
      assistance: evidence.correctionOf ? "explained" : evidence.assistance,
      result: finding.result,
    });
    if (next !== schedule) changes.push({ path: schedulePath(next.knowledgeId), after: encodeSchedule(next) });
  }
  return changes;
}

export async function reviewAnswerOptions(root: string) {
  return { extraChanges: (evidence: Evidence, question: StoredQuestion) => reviewScheduleChanges(root, evidence, question) };
}
