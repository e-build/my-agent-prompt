/**
 * Pure state machine for one placement diagnosis: the project-level dialogue
 * that fixes the curriculum's starting point before the project is registered.
 * Shares limit and end-reason rules with the chapter diagnosis.
 */
import { questionIdFor } from "../evidence/question-id.ts";
import { ASSISTANCE, DEMONSTRATIONS, type Assistance, type Criteria, type Demonstration } from "../evidence/evidence-types.ts";
import { sha256 } from "../workspace/atomic-file.ts";
import type { DiagnosisEndReason, LearningRoute } from "../session/dialogue-state.ts";

export const DEFAULT_PLACEMENT_LIMIT = 8;
const END_REASONS: DiagnosisEndReason[] = ["route_decided", "limit_reached", "user_request"];
const QUESTION_ID = /^q-[0-9a-f]{20}$/;

export type PlacementStrand = { id: string; name: string; why: string };

export type PlacementQuestion = {
  id: string;
  requestId: string;
  payloadSha256: string;
  strandId: string;
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  scored: boolean;
  /** Hidden until the learner has answered; null for unscored questions. */
  criteria: Criteria | null;
  askedAt: string;
};

export type PlacementAnswer = {
  questionId: string;
  response: string;
  responseAnchor: string;
  assistance: Assistance;
  /** Learner's self-reported confidence, 0~1 (asked as 0~10). Absent when not given. */
  confidence?: number;
  result: Demonstration;
  reason: string;
  at: string;
};

export type PlacementRun = {
  schemaVersion: 1;
  id: string;
  projectSlug: string;
  limit: number;
  status: "open" | "finished";
  strands: PlacementStrand[];
  questions: PlacementQuestion[];
  answers: PlacementAnswer[];
  startedAt: string;
  finishedAt?: string;
  endReason?: DiagnosisEndReason;
  route?: LearningRoute;
  unverified: string[];
};

export type PublicPlacementQuestion = Omit<PlacementQuestion, "criteria" | "payloadSha256">;
export type PublicPlacement = Omit<PlacementRun, "questions"> & { questions: PublicPlacementQuestion[] };

export type PlacementQuestionInput = {
  requestId: string;
  strandId: string;
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  scored: boolean;
  criteria?: Criteria | null;
  at: string;
};

export type PlacementAnswerInput = Omit<PlacementAnswer, "reason"> & { reason?: string };

function clip(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}

function validateStrands(value: unknown): PlacementStrand[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("선수 갈래를 하나 이상 지정하세요.");
  const seen = new Set<string>();
  return value.map((s) => {
    if (!s || typeof s.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(s.id))
      throw new Error(`갈래 id가 올바르지 않습니다: ${s?.id}`);
    if (seen.has(s.id)) throw new Error(`갈래 id가 중복됐습니다: ${s.id}`);
    seen.add(s.id);
    if (typeof s.name !== "string" || !s.name.trim()) throw new Error(`갈래 이름이 필요합니다: ${s.id}`);
    return { id: s.id, name: clip(s.name, 200), why: clip(s.why, 1000) };
  });
}

function validateCriteria(value: unknown): Criteria {
  const c = value as Criteria;
  if (!c || typeof c !== "object" || typeof c.answer !== "string" || !c.answer.trim())
    throw new Error("채점 질문에는 출제 전에 확정한 채점 기준(answer)이 필요합니다.");
  if (typeof c.rubric !== "string") throw new Error("채점 기준 rubric이 필요합니다.");
  const list = (v: unknown, field: string) => {
    if (!Array.isArray(v)) throw new Error(`채점 기준 ${field} 목록이 필요합니다.`);
    return v.map((x) => clip(x, 2000));
  };
  return { answer: clip(c.answer, 5000), acceptable: list(c.acceptable, "acceptable"), rubric: clip(c.rubric, 5000), conditions: list(c.conditions, "conditions") };
}

function validateRoute(route: LearningRoute | undefined): LearningRoute {
  if (!route || typeof route.summary !== "string" || !route.summary.trim() || typeof route.startAt !== "string")
    throw new Error("학습 경로(route: summary, startAt, focus, skip)가 필요합니다.");
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => clip(x, 500)) : []);
  return { summary: clip(route.summary, 2000), startAt: clip(route.startAt, 500), focus: list(route.focus), skip: list(route.skip) };
}

export function createPlacement(args: { id: string; projectSlug: string; strands: PlacementStrand[]; limit?: number; at: string }): PlacementRun {
  const limit = args.limit ?? DEFAULT_PLACEMENT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("배치 진단 문항 상한은 1~20이어야 합니다.");
  if (typeof args.projectSlug !== "string" || !args.projectSlug.trim()) throw new Error("projectSlug가 필요합니다.");
  return {
    schemaVersion: 1,
    id: args.id,
    projectSlug: args.projectSlug,
    limit,
    status: "open",
    strands: validateStrands(args.strands),
    questions: [],
    answers: [],
    startedAt: args.at,
    unverified: [],
  };
}

/** Fix the hidden criteria first; a retried requestId returns the run unchanged. */
export function addPlacementQuestion(run: PlacementRun, input: PlacementQuestionInput): PlacementRun {
  const id = questionIdFor(input?.requestId);
  const { at: _at, ...payload } = input;
  const payloadSha256 = sha256(JSON.stringify(payload));
  const existing = run.questions.find((q) => q.id === id);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256)
      throw new Error(`같은 requestId로 다른 질문을 만들 수 없습니다. 새 requestId를 쓰세요: ${input.requestId}`);
    return run;
  }
  if (run.status === "finished") throw new Error("이 배치 진단은 이미 종료됐습니다. 다시 진단하려면 새 시도를 명시적으로 시작하세요.");
  if (!run.strands.some((s) => s.id === input.strandId)) throw new Error(`등록되지 않은 갈래입니다: ${input.strandId}`);
  if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 5000) throw new Error("prompt가 필요합니다.");
  if (typeof input.scored !== "boolean") throw new Error("scored(채점 여부)를 명시하세요.");
  if (run.questions.length >= run.limit)
    throw new Error(`배치 진단 문항 상한(${run.limit})에 도달했습니다. 지금까지의 응답으로 시작점을 정하고 종료하세요.`);
  const criteria = input.scored ? validateCriteria(input.criteria) : null;
  const options = input.options?.map((o) => ({ id: clip(o.id, 20), text: clip(o.text, 2000) }));
  const question: PlacementQuestion = {
    id,
    requestId: input.requestId,
    payloadSha256,
    strandId: input.strandId,
    prompt: input.prompt,
    ...(options ? { options } : {}),
    scored: input.scored,
    criteria,
    askedAt: input.at,
  };
  return { ...run, questions: [...run.questions, question] };
}

export function recordPlacementAnswer(run: PlacementRun, input: PlacementAnswerInput): PlacementRun {
  const question = run.questions.find((q) => q.id === input?.questionId);
  if (!question) throw new Error(`질문을 찾지 못했습니다: ${input?.questionId}`);
  if (run.answers.some((a) => a.questionId === question.id)) throw new Error(`이미 기록된 응답입니다: ${question.id}`);
  if (typeof input.response !== "string" || !input.response.trim()) throw new Error("response(원 응답)가 필요합니다.");
  if (typeof input.responseAnchor !== "string" || !input.responseAnchor.trim()) throw new Error("responseAnchor(원 응답 위치)가 필요합니다.");
  if (!ASSISTANCE.includes(input.assistance)) throw new Error(`assistance가 올바르지 않습니다: ${input.assistance}`);
  if (!DEMONSTRATIONS.includes(input.result)) throw new Error(`result가 올바르지 않습니다: ${input.result}`);
  if (input.confidence !== undefined && !(typeof input.confidence === "number" && input.confidence >= 0 && input.confidence <= 1))
    throw new Error("confidence는 0~1 사이여야 합니다(학습자의 0~10 답을 10으로 나눈 값).");
  if (!question.scored && input.result !== "unverified")
    throw new Error("비채점 질문의 응답으로 이해 여부를 판정할 수 없습니다. unverified만 허용합니다.");
  const answer: PlacementAnswer = {
    questionId: question.id,
    response: clip(input.response, 50_000),
    responseAnchor: clip(input.responseAnchor, 1000),
    assistance: input.assistance,
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    result: input.result,
    reason: clip(input.reason, 2000),
    at: input.at,
  };
  return { ...run, answers: [...run.answers, answer] };
}

export function finishPlacement(
  run: PlacementRun,
  args: { reason: DiagnosisEndReason; route?: LearningRoute; unverified: string[]; at: string },
): PlacementRun {
  if (run.status === "finished") throw new Error("이미 종료된 배치 진단입니다.");
  if (!END_REASONS.includes(args.reason)) throw new Error(`종료 reason이 올바르지 않습니다: ${args.reason}`);
  if (args.reason === "limit_reached" && run.questions.length < run.limit)
    throw new Error(`아직 상한(${run.limit})에 도달하지 않았습니다. route_decided 또는 user_request로 종료하세요.`);
  const route = args.reason === "user_request" ? (args.route ? validateRoute(args.route) : undefined) : validateRoute(args.route);
  return {
    ...run,
    status: "finished",
    finishedAt: args.at,
    endReason: args.reason,
    ...(route ? { route } : {}),
    unverified: (args.unverified ?? []).map((x) => clip(x, 1000)),
  };
}

/** What may be shown or returned to the learner: no criteria. */
export function publicPlacement(run: PlacementRun): PublicPlacement {
  return {
    ...run,
    questions: run.questions.map(({ criteria: _c, payloadSha256: _p, ...rest }) => rest),
  };
}

export function validatePlacement(run: PlacementRun): void {
  if (!run || run.schemaVersion !== 1 || typeof run.id !== "string" || !Array.isArray(run.questions) || !Array.isArray(run.answers))
    throw new Error("배치 진단 기록 형식이 올바르지 않습니다.");
  if (!Number.isInteger(run.limit) || run.limit < 1 || run.limit > 20) throw new Error("배치 진단 기록의 상한이 올바르지 않습니다.");
  if (run.status !== "open" && run.status !== "finished") throw new Error("배치 진단 상태가 올바르지 않습니다.");
  validateStrands(run.strands);
  const ids = run.questions.map((q) => q.id);
  if (ids.some((id) => !QUESTION_ID.test(id))) throw new Error("배치 진단 질문 ID 형식이 올바르지 않습니다.");
  if (new Set(ids).size !== ids.length) throw new Error("배치 진단 질문 ID가 중복됐습니다.");
  if (ids.length > run.limit) throw new Error("배치 진단 기록이 문항 상한을 넘었습니다.");
  for (const a of run.answers) if (!ids.includes(a.questionId)) throw new Error(`응답이 가리키는 질문이 없습니다: ${a.questionId}`);
  if (new Set(run.answers.map((a) => a.questionId)).size !== run.answers.length) throw new Error("같은 질문의 응답이 중복됐습니다.");
}

export function restorePlacement(json: string): PlacementRun {
  let run: PlacementRun;
  try {
    run = JSON.parse(json);
  } catch {
    throw new Error("배치 진단 기록이 손상됐습니다.");
  }
  validatePlacement(run);
  return run;
}
