import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as review from "./review-page.ts";

async function fixture(schedule = "") {
  const root = await mkdtemp(join(tmpdir(), "review-page-"));
  const dir = join(root, "ch-01-cache", "review");
  await mkdir(dir, { recursive: true });
  await writeFile(join(root, "ch-01-cache", "README.md"), "# Cache\n\n## 개념 학습 노트\n\n正解 SECRET ANSWER\n");
  await writeFile(join(dir, "blank-recall.md"), "오답 교정 SECRET CORRECTION\n");
  if (schedule) await writeFile(join(dir, "schedule.md"), schedule);
  return { root, dir };
}
const schedule = `# 복습 일정

- 주기 상태: in_progress

## 반복할 핵심 개념

| ID | 개념 이름 | 교재 위치 |
|---|---|---|
| C1 | 캐시 책임 구분 | ../README.md#개념-학습-노트 |

## 고정 회차

| 회차 | 예정일 | 상태 | 실제 수행일 | 기록 |
|---|---|---|---|---|
| R1 | 2026-10-01 | completed | 2026-10-01 | sessions/r1.md |
| R2 | 2026-10-04 | planned | - | - |

## 개인 오답

SECRET CORRECTION
`;
async function build(root: string, date = "2026-10-02") {
  assert.equal(typeof review.buildReviewStartPage, "function");
  return review.buildReviewStartPage(root, "ch-01-cache", date);
}

test("renders a navigation page without copying answers or correction records", async () => {
  const { root, dir } = await fixture(schedule);
  const path = await build(root);
  assert.equal(path, join(dir, "README.md"));
  const page = await readFile(path, "utf8");
  assert.match(page, /캐시 책임 구분/);
  assert.match(page, /R2.*2026-10-04/);
  assert.match(page, /STT.*텍스트/);
  assert.match(page, /schedule\.md/);
  assert.match(page, /sessions\/r1.md/);
  assert.doesNotMatch(page, /SECRET|正解|오답 교정/);
  assert.ok(!(await readdir(dir)).includes("study-pack.md"));
});

test("does not invent review dates when intervals have not been agreed", async () => {
  const { root, dir } = await fixture();
  await build(root);
  const page = await readFile(join(dir, "README.md"), "utf8");
  assert.match(page, /일정 설정 필요/);
  const originalSchedule = await readFile(join(dir, "schedule.md"), "utf8");
  assert.doesNotMatch(originalSchedule, /\d{4}-\d{2}-\d{2}/);
  assert.equal(review.scheduleProgress(originalSchedule, "2026-10-02").completed, false);
});

test("distinguishes overdue, today, and future rounds without using the wall clock", () => {
  assert.equal(typeof review.scheduleProgress, "function");
  assert.equal(review.scheduleProgress(schedule, "2026-10-05").timing, "overdue");
  assert.equal(review.scheduleProgress(schedule, "2026-10-04").timing, "today");
  assert.equal(review.scheduleProgress(schedule, "2026-10-02").timing, "future");
});

test("scheduled dates alone never mean that the review cycle is complete", () => {
  assert.equal(typeof review.scheduleProgress, "function");
  assert.equal(review.scheduleProgress(schedule, "2026-10-05").completed, false);
  assert.equal(review.scheduleProgress("# 일정\n다음 복습 2026-10-04\n완료", "2026-10-05").completed, false);
  const done = schedule.replace("주기 상태: in_progress", "주기 상태: completed").replace("R2 | 2026-10-04 | planned | - | -", "R2 | 2026-10-04 | completed | 2026-10-04 | sessions/r2.md");
  assert.equal(review.scheduleProgress(done, "2026-10-05").completed, true);
  assert.equal(review.scheduleProgress(done.replace("completed | 2026-10-04", "completed | -"), "2026-10-05").completed, false);
});

test("preserves legacy pack recall idempotently without deleting or exposing it", async () => {
  const { root, dir } = await fixture(schedule);
  const pack = "# 묶음\nSECRET ANSWER\n## 복습 회상 기록\n\n고유 회상 기록\n\n### Review 기록 원본\nSECRET CORRECTION\n";
  await writeFile(join(dir, "study-pack.md"), pack);
  await build(root);
  const archive = await readFile(join(dir, "legacy-recall.md"), "utf8");
  assert.match(archive, /고유 회상 기록/);
  assert.doesNotMatch(archive, /SECRET/);
  await build(root);
  assert.equal(await readFile(join(dir, "legacy-recall.md"), "utf8"), archive);
  assert.equal(await readFile(join(dir, "study-pack.md"), "utf8"), pack);
  assert.doesNotMatch(await readFile(join(dir, "README.md"), "utf8"), /고유 회상 기록|SECRET/);
});

test("rejects external and parent traversal links from schedule metadata", async () => {
  const unsafe = schedule.replace("../README.md#개념-학습-노트", "javascript:alert(1)").replace("sessions/r1.md", "../../../secret.md");
  const { root, dir } = await fixture(unsafe);
  await build(root);
  assert.doesNotMatch(await readFile(join(dir, "README.md"), "utf8"), /javascript:|secret\.md/);
});

test("retains manual notes outside the generated navigation block", async () => {
  const { root, dir } = await fixture(schedule);
  await build(root);
  const path = join(dir, "README.md");
  await writeFile(path, (await readFile(path, "utf8")) + "\n## 개인 안내\n내 메모\n");
  await build(root);
  assert.match(await readFile(path, "utf8"), /내 메모/);
});

test("refuses to overwrite a preexisting unmanaged review README", async () => {
  const { root, dir } = await fixture(schedule);
  await writeFile(join(dir, "README.md"), "# 내 복습 안내\n고유 기록\n");
  await assert.rejects(() => build(root), /기존.*README/);
  assert.match(await readFile(join(dir, "README.md"), "utf8"), /고유 기록/);
});


test("a completion marker with missing round records is not displayed as a completed cycle", async () => {
  const done = schedule.replace("주기 상태: in_progress", "주기 상태: completed").replace("R2 | 2026-10-04 | planned | - | -", "R2 | 2026-10-04 | completed | 2026-10-04 | sessions/r2.md");
  const { root, dir } = await fixture(done);
  await build(root);
  assert.match(await readFile(join(dir, "README.md"), "utf8"), /복습 주기 미완료/);
  await mkdir(join(dir, "sessions"));
  await writeFile(join(dir, "sessions/r1.md"), "# R1 수행 기록\n- 원 답변: 설명\n");
  await writeFile(join(dir, "sessions/r2.md"), "# R2 수행 기록\n- 원 답변: 설명\n");
  await build(root);
  assert.match(await readFile(join(dir, "README.md"), "utf8"), /예정된 복습 주기 완료/);
});
