import type { Assistance, Demonstration } from "../evidence/evidence-types.ts";
import { addCalendarDays, assertDate } from "./review-date.ts";
import { isValidTimezone } from "../workspace/workspace-types.ts";

export type ReviewOutcome =
  | "correct"
  | "hinted_correct"
  | "incorrect"
  | "partial"
  | "unverified"
  | "correction_check";

export type ReviewHistoryEntry = {
  evidenceId: string;
  localDate: string;
  stage: number;
  outcome: ReviewOutcome;
  nextDueDate: string | null;
};

/** One finite review cycle per proposition. Intervals are snapshotted at creation. */
export type ReviewSchedule = {
  schemaVersion: 1;
  knowledgeId: string;
  cycleId: string;
  status: "active" | "completed" | "merged";
  intervals: number[];
  timezone: string;
  /** Local date the chapter was completed (test pass or completion processing). */
  baseDate: string;
  /** Index into intervals of the next round to perform. */
  nextStage: number;
  dueDate: string | null;
  origin: { projectId: string; chapterSlug: string };
  history: ReviewHistoryEntry[];
  mergedInto?: string;
  /** Schedules absorbed by a merge, kept for undo and lineage. */
  absorbed?: ReviewSchedule[];
};

export type ReviewEvent = {
  evidenceId: string;
  localDate: string;
  assistance: Assistance;
  result: Demonstration;
};

export function createSchedule(args: {
  knowledgeId: string;
  completedOn: string;
  intervals: number[];
  timezone: string;
  origin: { projectId: string; chapterSlug: string };
  cycleId?: string;
}): ReviewSchedule {
  assertDate(args.completedOn);
  if (!Array.isArray(args.intervals) || !args.intervals.length || args.intervals.some((n) => !Number.isInteger(n) || n < 1))
    throw new Error("복습 간격은 양의 정수 목록이어야 합니다.");
  if (!isValidTimezone(args.timezone)) throw new Error(`timezone이 올바르지 않습니다: ${args.timezone}`);
  return {
    schemaVersion: 1,
    knowledgeId: args.knowledgeId,
    cycleId: args.cycleId ?? `cycle-${args.knowledgeId}-${args.completedOn}`,
    status: "active",
    intervals: [...args.intervals],
    timezone: args.timezone,
    baseDate: args.completedOn,
    nextStage: 0,
    dueDate: addCalendarDays(args.completedOn, args.intervals[0]),
    origin: { ...args.origin },
    history: [],
  };
}

function outcomeOf(event: ReviewEvent): ReviewOutcome {
  if (event.result === "unverified" || event.assistance === "unknown") return "unverified";
  if (event.assistance === "explained") return "correction_check";
  if (event.result === "incorrect") return "incorrect";
  if (event.result === "partial") return "partial";
  return event.assistance === "hinted" ? "hinted_correct" : "correct";
}

/**
 * Apply one recall result. Independent correct → next interval from the
 * actual day; wrong, partial or hinted → restart at the shortest interval;
 * unverified/unknown/right-after-explanation → recorded, schedule unchanged.
 */
export function advanceReview(schedule: ReviewSchedule, event: ReviewEvent): ReviewSchedule {
  if (schedule.history.some((h) => h.evidenceId === event.evidenceId)) return schedule;
  if (schedule.status !== "active" || !schedule.dueDate)
    throw new Error(`이미 종료된 복습 일정입니다: ${schedule.knowledgeId}`);
  assertDate(event.localDate);
  const outcome = outcomeOf(event);
  if (event.localDate < schedule.dueDate && outcome !== "unverified" && outcome !== "correction_check")
    throw new Error(`아직 예정일(${schedule.dueDate}) 전입니다. 미래 회차를 미리 수행하지 않습니다.`);
  let nextStage = schedule.nextStage;
  let dueDate: string | null = schedule.dueDate;
  let status: ReviewSchedule["status"] = "active";
  if (outcome === "correct") {
    nextStage = schedule.nextStage + 1;
    if (nextStage >= schedule.intervals.length) {
      status = "completed";
      dueDate = null;
    } else dueDate = addCalendarDays(event.localDate, schedule.intervals[nextStage]);
  } else if (outcome === "incorrect" || outcome === "partial" || outcome === "hinted_correct") {
    nextStage = 0;
    dueDate = addCalendarDays(event.localDate, schedule.intervals[0]);
  }
  return {
    ...schedule,
    status,
    nextStage,
    dueDate,
    history: [
      ...schedule.history,
      { evidenceId: event.evidenceId, localDate: event.localDate, stage: schedule.nextStage, outcome, nextDueDate: dueDate },
    ],
  };
}
