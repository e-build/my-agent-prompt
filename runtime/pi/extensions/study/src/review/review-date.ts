import { isValidTimezone } from "../workspace/workspace-types.ts";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertDate(value: string): string {
  const match = typeof value === "string" ? value.match(DATE) : null;
  if (!match) throw new Error(`날짜는 YYYY-MM-DD 형식이어야 합니다: ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new Error(`존재하지 않는 날짜입니다: ${value}`);
  return value;
}

/** Pure calendar-day addition; never `24h * n` on instants. */
export function addCalendarDays(date: string, days: number): string {
  assertDate(date);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The learner's local calendar date for an instant in an IANA timezone. */
export function localDate(instant: string | Date, timezone: string): string {
  if (!isValidTimezone(timezone)) throw new Error(`timezone이 올바르지 않습니다: ${timezone}`);
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new Error(`시각이 올바르지 않습니다: ${instant}`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
