/** Pure state machine for one conversational diagnosis attempt. */
export const DEFAULT_DIAGNOSIS_LIMIT = 8;
export type DiagnosisEndReason = "route_decided" | "limit_reached" | "user_request";
const END_REASONS: DiagnosisEndReason[] = ["route_decided", "limit_reached", "user_request"];

export type LearningRoute = {
  summary: string;
  startAt: string;
  focus: string[];
  skip: string[];
};

export type DiagnosisRun = {
  id: string;
  chapterSlug: string;
  limit: number;
  status: "open" | "finished";
  /** Unique prepared question IDs; the count never resets on resume. */
  questionIds: string[];
  startedAt: string;
  finishedAt?: string;
  endReason?: DiagnosisEndReason;
  route?: LearningRoute;
  /** Areas not confirmed. Never treated as understood. */
  unverified: string[];
};

export function createDiagnosis(args: { id: string; chapterSlug: string; limit?: number; at: string }): DiagnosisRun {
  const limit = args.limit ?? DEFAULT_DIAGNOSIS_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("진단 문항 상한은 1~20이어야 합니다.");
  return {
    id: args.id,
    chapterSlug: args.chapterSlug,
    limit,
    status: "open",
    questionIds: [],
    startedAt: args.at,
    unverified: [],
  };
}

export function prepareDiagnosisQuestion(run: DiagnosisRun, questionId: string): DiagnosisRun {
  if (run.status === "finished")
    throw new Error("이 진단은 이미 종료됐습니다. 다시 진단하려면 새 시도를 명시적으로 시작하세요.");
  if (run.questionIds.includes(questionId)) return run;
  if (run.questionIds.length >= run.limit)
    throw new Error(`진단 문항 상한(${run.limit})에 도달했습니다. 지금까지의 응답으로 학습 경로를 정하고 종료하세요.`);
  return { ...run, questionIds: [...run.questionIds, questionId] };
}

function validateRoute(route: LearningRoute | undefined): LearningRoute {
  if (!route || typeof route.summary !== "string" || !route.summary.trim() || typeof route.startAt !== "string")
    throw new Error("학습 경로(route: summary, startAt, focus, skip)가 필요합니다.");
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 500)) : []);
  return { summary: route.summary.slice(0, 2000), startAt: route.startAt.slice(0, 500), focus: list(route.focus), skip: list(route.skip) };
}

export function finishDiagnosis(
  run: DiagnosisRun,
  args: { reason: DiagnosisEndReason; route?: LearningRoute; unverified: string[]; at: string },
): DiagnosisRun {
  if (run.status === "finished") throw new Error("이미 종료된 진단입니다.");
  if (!END_REASONS.includes(args.reason)) throw new Error(`종료 reason이 올바르지 않습니다: ${args.reason}`);
  if (args.reason === "limit_reached" && run.questionIds.length < run.limit)
    throw new Error(`아직 상한(${run.limit})에 도달하지 않았습니다. route_decided 또는 user_request로 종료하세요.`);
  const route = args.reason === "user_request" ? (args.route ? validateRoute(args.route) : undefined) : validateRoute(args.route);
  return {
    ...run,
    status: "finished",
    finishedAt: args.at,
    endReason: args.reason,
    ...(route ? { route } : {}),
    unverified: (args.unverified ?? []).map((x) => String(x).slice(0, 1000)),
  };
}

export function restoreDiagnosis(json: string): DiagnosisRun {
  let run: DiagnosisRun;
  try {
    run = JSON.parse(json);
  } catch {
    throw new Error("진단 기록이 손상됐습니다.");
  }
  validateRun(run);
  return run;
}

export function validateRun(run: DiagnosisRun): void {
  if (!run || typeof run.id !== "string" || !Array.isArray(run.questionIds) || !Number.isInteger(run.limit))
    throw new Error("진단 기록 형식이 올바르지 않습니다.");
  if (new Set(run.questionIds).size !== run.questionIds.length) throw new Error("진단 질문 ID가 중복됐습니다.");
  if (run.questionIds.length > run.limit) throw new Error("진단 기록이 문항 상한을 넘었습니다.");
  if (run.status !== "open" && run.status !== "finished") throw new Error("진단 상태가 올바르지 않습니다.");
}
