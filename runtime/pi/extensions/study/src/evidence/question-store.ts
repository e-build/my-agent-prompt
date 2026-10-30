import { join } from "node:path";
import { loadChains, loadHistory, loadItem } from "../knowledge/knowledge-store.ts";
import { validateRef } from "../knowledge/knowledge-validation.ts";
import type { KnowledgeItem, KnowledgeRef } from "../knowledge/knowledge-types.ts";
import { readTextOptional, sha256 } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan, type PlannedChange } from "../workspace/change-plan.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import {
  PURPOSES,
  type Criteria,
  type PublicQuestion,
  type QuestionContext,
  type QuestionPurpose,
  type StoredQuestion,
} from "./evidence-types.ts";

export type QuestionInput = {
  requestId: string;
  purpose: QuestionPurpose;
  scored: boolean;
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  refs: KnowledgeRef[];
  chainRefs?: Array<{ chainId: string; revisionId: string }>;
  criteria?: Criteria;
  context?: QuestionContext;
};

export const REVIEW_QUESTIONS = "review/questions";

export function questionIdFor(requestId: string): string {
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId))
    throw new Error(`requestId 형식이 올바르지 않습니다: ${requestId}`);
  return `q-${sha256(`question:${requestId}`).slice(0, 20)}`;
}

/** Revision lookup: current item or a snapshot in its history. */
export async function itemAtRef(root: string, ref: KnowledgeRef): Promise<KnowledgeItem> {
  const current = await loadItem(root, ref.id);
  if (!current) throw new Error(`지식을 찾지 못했습니다: ${ref.id}`);
  if (current.revisionId === ref.revisionId) return current;
  const snapshot = (await loadHistory(root, ref.id)).find((e) => e.revisionId === ref.revisionId)?.snapshot;
  if (!snapshot) throw new Error(`지식 버전을 찾지 못했습니다: ${ref.id}@${ref.revisionId}`);
  return snapshot;
}

function validateCriteria(value: unknown): Criteria {
  const c = value as Criteria;
  if (!c || typeof c !== "object" || typeof c.answer !== "string" || !c.answer.trim())
    throw new Error("채점 질문에는 출제 전에 확정한 채점 기준(answer)이 필요합니다.");
  if (typeof c.rubric !== "string") throw new Error("채점 기준 rubric이 필요합니다.");
  const list = (v: unknown, field: string) => {
    if (!Array.isArray(v)) throw new Error(`채점 기준 ${field} 목록이 필요합니다.`);
    return v.map((x) => String(x).slice(0, 2000));
  };
  return {
    answer: c.answer.slice(0, 5000),
    acceptable: list(c.acceptable, "acceptable"),
    rubric: c.rubric.slice(0, 5000),
    conditions: list(c.conditions, "conditions"),
  };
}

async function resolveLocation(root: string, purpose: QuestionPurpose, context: QuestionContext = {}) {
  if (purpose === "review") return { location: REVIEW_QUESTIONS, context: {} as StoredQuestion["context"], projectPaths: [] as string[] };
  if (!context.projectSlug || !context.chapterSlug)
    throw new Error("진단·개념·실습 질문에는 context.projectSlug와 chapterSlug가 필요합니다.");
  if (!/^ch-\d+-[a-z0-9-]+$/.test(context.chapterSlug)) throw new Error(`챕터 slug가 올바르지 않습니다: ${context.chapterSlug}`);
  const workspace = await readWorkspace(root);
  const project = workspace.manifest.projects.find((p) => p.slug === context.projectSlug || p.id === context.projectSlug);
  if (!project) throw new Error(`등록된 프로젝트가 아닙니다: ${context.projectSlug}`);
  return {
    location: `${project.path}/.study/dialogue/questions`,
    context: { projectId: project.id, projectSlug: project.slug, chapterSlug: context.chapterSlug },
    projectPaths: [project.path],
  };
}

async function findQuestionPath(root: string, id: string): Promise<string | null> {
  const workspace = await readWorkspace(root);
  const candidates = [REVIEW_QUESTIONS, ...workspace.manifest.projects.map((p) => `${p.path}/.study/dialogue/questions`)];
  for (const location of candidates) {
    const relative = `${location}/${id}.json`;
    if ((await readTextOptional(join(root, ...relative.split("/")))) !== null) return relative;
  }
  return null;
}

export async function loadQuestion(root: string, id: string): Promise<StoredQuestion | null> {
  if (!/^q-[0-9a-f]{20}$/.test(id)) throw new Error(`질문 ID가 올바르지 않습니다: ${id}`);
  const relative = await findQuestionPath(root, id);
  if (!relative) return null;
  const content = (await readTextOptional(join(root, ...relative.split("/"))))!;
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`질문 기록이 손상됐습니다: ${relative}`);
  }
}

export function publicQuestion(question: StoredQuestion): PublicQuestion {
  return {
    id: question.id,
    purpose: question.purpose,
    scored: question.scored,
    prompt: question.prompt,
    ...(question.options ? { options: question.options.map((o) => ({ id: o.id, text: o.text })) } : {}),
    refs: question.refs.map((r) => ({ id: r.id, version: r.version })),
    context: question.context,
  };
}

export type PrepareOptions = {
  now?: () => string;
  /** Extra files (e.g. dialogue run counters) committed together with the question. */
  extraChanges?: (question: StoredQuestion) => Promise<PlannedChange[]>;
  /** Called only for a brand-new question, after validation and before writing. */
  beforeCreate?: (question: StoredQuestion) => Promise<void>;
};

/**
 * Save hidden criteria first, then return only the public part. A failed save
 * never yields a question; a retried requestId returns the stored question.
 */
export async function prepareQuestion(
  root: string,
  input: QuestionInput,
  options: PrepareOptions = {},
): Promise<PublicQuestion> {
  const id = questionIdFor(input?.requestId);
  const payloadSha256 = sha256(JSON.stringify(input));
  const existing = await loadQuestion(root, id);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256)
      throw new Error(`같은 requestId로 다른 질문을 만들 수 없습니다. 새 requestId를 쓰세요: ${input.requestId}`);
    return publicQuestion(existing);
  }
  if (!PURPOSES.includes(input.purpose)) throw new Error(`purpose가 올바르지 않습니다: ${input.purpose}`);
  if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 5000)
    throw new Error("prompt가 필요합니다.");
  if (typeof input.scored !== "boolean") throw new Error("scored(채점 여부)를 명시하세요.");
  const refs = (Array.isArray(input.refs) ? input.refs : []).map((r) => validateRef(r));
  if (new Set(refs.map((r) => r.id)).size !== refs.length) throw new Error("같은 지식이 중복됐습니다.");
  for (const ref of refs) {
    const item = await itemAtRef(root, ref);
    if (input.scored && (item.status !== "confirmed" || item.mergedInto))
      throw new Error(`확정되지 않은 지식은 채점 기준으로 쓸 수 없습니다: ${ref.id} (${item.status})`);
  }
  if (input.scored && !refs.length) throw new Error("채점 질문은 확인할 지식을 하나 이상 지정해야 합니다.");
  const chains = await loadChains(root);
  const chainRefs = (input.chainRefs ?? []).map((c) => {
    const chain = chains.find((x) => x.id === c.chainId && x.revisionId === c.revisionId && !x.retired);
    if (!chain) throw new Error(`추론 사슬을 찾지 못했습니다: ${c.chainId}`);
    for (const r of [...chain.premiseRefs, chain.conclusionRef])
      if (!refs.some((ref) => ref.id === r.id)) throw new Error(`추론 사슬의 지식이 질문 refs에 없습니다: ${r.id}`);
    return { chainId: c.chainId, revisionId: c.revisionId };
  });
  const criteria = input.scored ? validateCriteria(input.criteria) : null;
  const optionList = input.options?.map((o) => ({ id: String(o.id).slice(0, 20), text: String(o.text).slice(0, 2000) }));
  const { location, context, projectPaths } = await resolveLocation(root, input.purpose, input.context);
  const at = (options.now ?? (() => new Date().toISOString()))();
  const question: StoredQuestion = {
    schemaVersion: 1,
    id,
    requestId: input.requestId,
    payloadSha256,
    purpose: input.purpose,
    scored: input.scored,
    prompt: input.prompt,
    ...(optionList ? { options: optionList } : {}),
    refs,
    chainRefs,
    criteria,
    criteriaRevisions: criteria ? [{ criteria, reason: "출제 전 확정", at }] : [],
    context,
    location,
    createdAt: at,
  };
  await options.beforeCreate?.(question);
  const changes: PlannedChange[] = [
    { path: `${location}/${id}.json`, after: `${JSON.stringify(question, null, 2)}\n` },
    ...((await options.extraChanges?.(question)) ?? []),
  ];
  const workspace = await readWorkspace(root);
  const plan = await preparePlan(root, `question-${id}`, changes, {
    projectPaths: [...new Set([...projectPaths, ...workspace.manifest.projects.map((p) => p.path)])],
  });
  await executePlan(root, plan);
  return publicQuestion(question);
}

/** Correct a flawed answer key without erasing the original one. */
export async function correctCriteria(
  root: string,
  id: string,
  criteria: Criteria,
  reason: string,
  now = () => new Date().toISOString(),
): Promise<StoredQuestion> {
  if (!reason?.trim()) throw new Error("채점 기준 정정에는 사유가 필요합니다.");
  const question = await loadQuestion(root, id);
  if (!question) throw new Error(`질문을 찾지 못했습니다: ${id}`);
  if (!question.scored) throw new Error("비채점 질문에는 채점 기준이 없습니다.");
  const valid = validateCriteria(criteria);
  const next: StoredQuestion = {
    ...question,
    criteria: valid,
    criteriaRevisions: [...question.criteriaRevisions, { criteria: valid, reason, at: now() }],
  };
  const workspace = await readWorkspace(root);
  const plan = await preparePlan(root, `question-${id}-criteria-${next.criteriaRevisions.length}`, [
    { path: `${question.location}/${id}.json`, after: `${JSON.stringify(next, null, 2)}\n` },
  ], { projectPaths: workspace.manifest.projects.map((p) => p.path) });
  await executePlan(root, plan);
  return next;
}
