import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan } from "../workspace/change-plan.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import { dueReviews } from "./review-query.ts";
import { listSchedules } from "./review-store.ts";

const START = "<!-- study-integrated-review:start -->";
const END = "<!-- study-integrated-review:end -->";
const TIMING: Record<string, string> = { overdue: "기한 경과", today: "오늘", future: "예정" };

function plain(value: string): string {
  return value.replace(/[\[\]<>`*_\\|]/g, "").replace(/[\r\n]/g, " ");
}

/**
 * `review/README.md` at the root: names, due dates and record links only.
 * Never statements, criteria or past answers.
 */
export async function buildIntegratedReviewPage(root: string, options: { today?: string } = {}): Promise<string> {
  const workspace = await readWorkspace(root);
  const relative = "review/README.md";
  const path = join(root, "review", "README.md");
  const previous = await readTextOptional(path);
  if (previous !== null && (!previous.includes(START) || !previous.includes(END) || previous.indexOf(START) > previous.indexOf(END)))
    throw new Error("기존 review/README.md에 관리 구역이 없어 자동 갱신을 멈췄습니다. 원본을 보존한 채 표시를 추가하세요.");
  const due = await dueReviews(root, { today: options.today, includeFuture: true });
  const schedules = await listSchedules(root);
  const active = due.items.filter((i) => i.timing !== "future");
  const upcoming = due.items.filter((i) => i.timing === "future").slice(0, 20);
  const projectName = (id: string) => workspace.manifest.projects.find((p) => p.id === id)?.slug ?? id;
  const row = (i: (typeof due.items)[number]) =>
    `| ${plain(i.name)} | ${i.dueDate} | ${TIMING[i.timing]} | ${i.round}/${i.totalRounds} | ${plain(projectName(i.projectId))}/${plain(i.chapterSlug)} |`;
  const lines = [
    START,
    "# 통합 복습",
    "",
    "## 목차",
    "",
    "- [오늘 할 복습](#오늘-할-복습)",
    "- [다가오는 복습](#다가오는-복습)",
    "- [진행 규칙](#진행-규칙)",
    "",
    `기준일: ${due.today} (${workspace.manifest.timezone}). 정답·채점 기준은 이 페이지에 없음.`,
    "",
    "## 오늘 할 복습",
    "",
    ...(active.length
      ? ["| 지식 | 예정일 | 상태 | 회차 | 처음 배운 곳 |", "|---|---|---|---|---|", ...active.map(row)]
      : ["- 오늘 할 복습 없음."]),
    "",
    "## 다가오는 복습",
    "",
    ...(upcoming.length
      ? ["| 지식 | 예정일 | 상태 | 회차 | 처음 배운 곳 |", "|---|---|---|---|---|", ...upcoming.map(row)]
      : ["- 예정된 복습 없음."]),
    "",
    `- 진행 중 ${schedules.filter((s) => s.status === "active").length}개, 마친 주기 ${schedules.filter((s) => s.status === "completed").length}개`,
    "",
    "## 진행 규칙",
    "",
    `- 간격: +${workspace.manifest.review.intervals.join(" / +")}일. 마지막 회차를 마치면 끝, 자동 연장 없음.`,
    "- 하루 양 제한 없음. 원할 때 멈추면 남은 항목은 날짜 그대로 남음.",
    "- 틀리거나 힌트 후 맞히면 그 지식만 가장 짧은 간격부터 다시. 늦게 하면 실제 복습한 날부터 계산.",
    "- 미래 회차는 미리 하지 않음. 시작: `/study-review`",
    "- 기록 원본: `review/sessions/`, 일정 원본: `review/items/`",
    END,
  ];
  const generated = lines.join("\n");
  const content = previous
    ? previous.slice(0, previous.indexOf(START)) + generated + previous.slice(previous.indexOf(END) + END.length)
    : `${generated}\n`;
  if (content !== previous) {
    const plan = await preparePlan(root, `review-page-${due.today}-${Date.now()}`, [{ path: relative, after: content }]);
    await executePlan(root, plan);
  }
  return path;
}
