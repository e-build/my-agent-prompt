import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectPath } from "./project-path.ts";

const START = "<!-- study-review-navigation:start -->";
const END = "<!-- study-review-navigation:end -->";

async function readOptional(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function date(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

function table(content: string, heading: string): string[][] {
  const body = content.split(`## ${heading}\n`)[1]?.split(/\n## /)[0] ?? "";
  return body.split("\n").filter((line) => line.startsWith("|")).slice(2)
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function recordLink(value: string): boolean {
  return /^[a-zA-Z0-9가-힣_-]+(?:\/[a-zA-Z0-9가-힣_-]+)*\.md$/.test(value);
}

function sourceLink(value: string): boolean {
  return /^\.\.\/README\.md(?:#[a-zA-Z0-9가-힣_-]+)?$/.test(value);
}

function plain(value: string): string {
  return value.replace(/[\[\]<>`*_\\]/g, "").replace(/[\r\n]/g, " ");
}

export function scheduleProgress(content: string, today = new Date().toISOString().slice(0, 10)) {
  if (!date(today)) throw new Error("today는 YYYY-MM-DD 날짜여야 합니다.");
  const rounds = table(content, "고정 회차").filter((cells) => cells.length === 5 && /^R\d+$/.test(cells[0]))
    .map(([id, due, status, performed, record]) => ({ id, due, status, performed, record }));
  const completed = /^- 주기 상태: completed\s*$/m.test(content) && rounds.length > 0
    && rounds.every((round) => round.status === "completed" && date(round.due) && date(round.performed) && recordLink(round.record));
  const next = rounds.find((round) => round.status !== "completed");
  const timing = !next || !date(next.due) ? "unscheduled" : next.due < today ? "overdue" : next.due === today ? "today" : "future";
  return { rounds, completed, next, timing };
}

export async function recordedScheduleProgress(projectRoot: string, chapterSlug: string, content: string, today?: string) {
  const progress = scheduleProgress(content, today);
  if (progress.completed) {
    for (const round of progress.rounds) {
      const record = await readOptional(projectPath(projectRoot, chapterSlug, "review", round.record));
      if (!record.trim() || /학습 후.*생성/.test(record)) {
        progress.completed = false;
        break;
      }
    }
  }
  return progress;
}

async function preserveLegacyRecall(dir: string): Promise<boolean> {
  const pack = await readOptional(join(dir, "study-pack.md"));
  const recall = pack.match(/^## 복습 회상 기록\r?\n([\s\S]*?)(?=\n### Review 기록 원본|(?![\s\S]))/m)?.[1]?.trim();
  if (!recall || /^이 챕터를 다시 복습할 때[^\n]*$/.test(recall)) return false;
  const path = join(dir, "legacy-recall.md");
  const previous = await readOptional(path);
  if (!previous.includes(recall)) {
    await writeFile(path, `${previous || "# 기존 복습 회상 기록\n\n## 목차\n\n- [보존 기록](#보존-기록)\n\n## 보존 기록\n"}\n${recall}\n`, "utf8");
  }
  return true;
}

export async function buildReviewStartPage(projectRoot: string, chapterSlug: string, today?: string): Promise<string> {
  const chapter = projectPath(projectRoot, chapterSlug);
  // Existing chapter required. This navigation builder is not a chapter scaffold.
  await readFile(join(chapter, "README.md"), "utf8");
  const dir = join(chapter, "review");
  const path = join(dir, "README.md");
  const previous = await readOptional(path);
  if (previous && (!previous.includes(START) || !previous.includes(END) || previous.indexOf(START) > previous.indexOf(END))) {
    throw new Error("기존 review/README.md에 관리 구역이 없어 자동 덮어쓰기를 중단했습니다. 원본을 보존한 뒤 이관하세요.");
  }
  await mkdir(dir, { recursive: true });
  const schedulePath = join(dir, "schedule.md");
  let schedule = await readOptional(schedulePath);
  if (!schedule.trim()) {
    schedule = "# 복습 일정\n\n## 목차\n\n- [설정](#설정)\n- [반복할 핵심 개념](#반복할-핵심-개념)\n- [고정 회차](#고정-회차)\n\n## 설정\n\n- 주기 상태: not_started\n- 일정 설정 필요: 학습자와 간격·기준일·시간대를 합의한 뒤 등록. 자동 날짜 배정 없음.\n\n## 반복할 핵심 개념\n\n| ID | 개념 이름 | 교재 위치 |\n|---|---|---|\n\n## 고정 회차\n\n| 회차 | 예정일 | 상태 | 실제 수행일 | 기록 |\n|---|---|---|---|---|\n";
    await writeFile(schedulePath, schedule, "utf8");
  }
  const progress = await recordedScheduleProgress(projectRoot, chapterSlug, schedule, today);
  const legacy = await preserveLegacyRecall(dir);
  const concepts = table(schedule, "반복할 핵심 개념")
    .filter((cells) => cells.length === 3 && /^C\d+$/.test(cells[0]))
    .map(([id, name, source]) => `- ${id}: ${plain(name)}${sourceLink(source) ? ` — [교재 위치](${source})` : ""}`);
  const labels = { overdue: "기한 경과 — 실제 수행일로 기록, 누락 회차 몰아치기 금지", today: "오늘 예정", future: "예정", unscheduled: "일정 설정 필요" };
  const lines = [
    START, `# 복습 시작 — ${plain(chapterSlug)}`, "", "## 목차", "",
    "- [현재 위치](#현재-위치)", "- [복습 시작 방법](#복습-시작-방법)",
    "- [반복할 핵심 개념](#반복할-핵심-개념)", "- [일정과 기록](#일정과-기록)", "- [막혔을 때 참고](#막혔을-때-참고)", "",
    "## 현재 위치", "",
    `- 완료 회차: ${progress.rounds.filter((round) => round.status === "completed").length}/${progress.rounds.length}`,
    `- 진행: ${progress.completed ? "예정된 복습 주기 완료 — 장기 기억 정착 인증 아님" : "복습 주기 미완료"}`,
    `- 다음: ${progress.next ? `${progress.next.id} / ${date(progress.next.due) ? progress.next.due : "미설정"} / ${labels[progress.timing]}` : progress.completed ? "필요 시 추가 복습 협의" : "일정 설정 필요"}`, "",
    "## 복습 시작 방법", "", `- 실행: \`/study-review ${chapterSlug}\``,
    "- 매 회차 시작 시 STT 또는 텍스트 선택. 중간 전환 가능.",
    "- 자료·과거 정답을 보기 전 회상. STT 인식 오류 의심 시 의미 확인.",
    "- self-lecture는 구두 설명 훈련. 텍스트 설명은 구두 완료로 기록하지 않으며 복습 회차를 막지 않음.", "",
    "## 반복할 핵심 개념", "", ...(concepts.length ? concepts : ["- 초기 복습 설정에서 개념 이름과 교재 위치 등록. 정의·정답은 이 페이지에 미노출."]), "",
    "## 일정과 기록", "", "- [고정 회차 일정 원본](schedule.md)",
    ...progress.rounds.filter((round) => recordLink(round.record)).map((round) => `- [${round.id} 수행 기록](${round.record})`),
    ...(legacy ? ["- [이전 회상 원본](legacy-recall.md) — 답변 후 참고"] : []), "",
    "## 막혔을 때 참고", "", "- [단권화 교재](../README.md)", "- [실습 결과](../lab/results.md)", "- [테스트 기록](../test.md)",
    "- [본 학습 범위 밖 공백](learning-gaps.md)", "", END,
  ];
  const generated = lines.join("\n");
  const content = previous ? previous.slice(0, previous.indexOf(START)) + generated + previous.slice(previous.indexOf(END) + END.length) : generated + "\n";
  await writeFile(path, content, "utf8");
  return path;
}
