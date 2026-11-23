import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addCalendarDays, assertDate } from "./review-date.ts";

export type ChapterKey = { projectSlug: string; chapterSlug: string };
export type RoundResult = "advanced" | "reset";
export type ScheduleEntry = ChapterKey & {
  baseDate: string;
  round: number;
  due: string | null;
  finishedOn?: string;
  history: Array<{ date: string; due: string; result: RoundResult; cardId: string }>;
};
export type Schedule = { version: 1; entries: ScheduleEntry[] };

const schedulePath = (root: string) => join(root, "review", "schedule.json");
const same = (a: ChapterKey, b: ChapterKey) =>
  a.projectSlug === b.projectSlug && a.chapterSlug === b.chapterSlug;

export async function loadSchedule(root: string): Promise<Schedule> {
  const path = schedulePath(root);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, entries: [] };
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`복습 일정 파일이 손상됐습니다: ${path}`);
  }
}

async function save(root: string, schedule: Schedule): Promise<void> {
  const path = schedulePath(root);
  await mkdir(join(root, "review"), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, `${JSON.stringify(schedule, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

const queues = new Map<string, Promise<unknown>>();

/** Serializes read-modify-write on one schedule file within this process. */
function mutate<T>(root: string, change: (schedule: Schedule) => T): Promise<T> {
  const path = schedulePath(root);
  const run = (queues.get(path) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const schedule = await loadSchedule(root);
      const result = change(schedule);
      await save(root, schedule);
      return result;
    });
  queues.set(path, run);
  return run;
}

/** Registers a finished chapter; re-enrolling an existing chapter keeps its progress. */
export function enroll(
  root: string,
  key: ChapterKey,
  completedOn: string,
  intervals: number[],
): Promise<ScheduleEntry> {
  assertDate(completedOn);
  return mutate(root, (schedule) => {
    const existing = schedule.entries.find((e) => same(e, key));
    if (existing) return existing;
    const entry: ScheduleEntry = {
      ...key,
      baseDate: completedOn,
      round: 1,
      due: addCalendarDays(completedOn, intervals[0]),
      history: [],
    };
    schedule.entries.push(entry);
    return entry;
  });
}

export function recordRound(
  root: string,
  key: ChapterKey,
  round: { date: string; result: RoundResult; cardId: string },
  intervals: number[],
): Promise<ScheduleEntry> {
  assertDate(round.date);
  return mutate(root, (schedule) => {
    const entry = schedule.entries.find((e) => same(e, key));
    if (!entry) throw new Error(`복습 일정에 없는 챕터입니다: ${key.projectSlug}/${key.chapterSlug}`);
    if (entry.due === null) throw new Error(`이미 끝난 복습입니다: ${key.chapterSlug}`);
    if (round.date < entry.due)
      throw new Error(`예정일(${entry.due}) 전에는 복습 회차를 기록할 수 없습니다.`);
    entry.history.push({ ...round, due: entry.due });
    if (round.result === "reset") {
      entry.round = 1;
      entry.due = addCalendarDays(round.date, intervals[0]);
    } else if (entry.round >= intervals.length) {
      entry.due = null;
      entry.finishedOn = round.date;
    } else {
      entry.due = addCalendarDays(round.date, intervals[entry.round]);
      entry.round += 1;
    }
    return entry;
  });
}

export async function due(
  root: string,
  today: string,
  filter: { projectSlug?: string; chapterSlug?: string } = {},
): Promise<ScheduleEntry[]> {
  assertDate(today);
  return (await loadSchedule(root)).entries
    .filter((e) => e.due !== null && e.due <= today)
    .filter((e) => !filter.projectSlug || e.projectSlug === filter.projectSlug)
    .filter((e) => !filter.chapterSlug || e.chapterSlug === filter.chapterSlug)
    .sort((a, b) => a.due!.localeCompare(b.due!) || a.chapterSlug.localeCompare(b.chapterSlug));
}
