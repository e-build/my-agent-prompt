import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTextOptional, sha256 } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan, type PlannedChange } from "../workspace/change-plan.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import {
  ASSISTANCE,
  DEMONSTRATIONS,
  type Assistance,
  type ChainFinding,
  type Evidence,
  type Finding,
  type StoredQuestion,
} from "./evidence-types.ts";
import { loadQuestion } from "./question-store.ts";

export type AnswerInput = {
  submissionId: string;
  questionId: string;
  response: string;
  responseAnchor: string;
  assistance: Assistance;
  submittedAt: string;
  confidence?: number;
  findings: Finding[];
  chainFindings?: ChainFinding[];
  correctionOf?: string;
  note?: string;
};

export const REVIEW_SESSIONS = "review/sessions";

/** Original answers live where they happened: project dialogue or root review sessions. */
export function evidenceFile(question: StoredQuestion): string {
  return question.purpose === "review"
    ? `${REVIEW_SESSIONS}/${question.id}.jsonl`
    : `${question.location.replace(/\/questions$/, "/evidence")}/${question.id}.jsonl`;
}

function parseLines(content: string | null, label: string): Evidence[] {
  if (!content) return [];
  return content
    .split("\n")
    .filter((l) => l.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line) as Evidence;
      } catch {
        throw new Error(`${label} ${i + 1}번째 줄이 손상됐습니다.`);
      }
    });
}

async function readEvidenceFile(root: string, relative: string): Promise<Evidence[]> {
  return parseLines(await readTextOptional(join(root, ...relative.split("/"))), relative);
}

function validateFindings(question: StoredQuestion, input: AnswerInput): Finding[] {
  if (!Array.isArray(input.findings)) throw new Error("findings 목록이 필요합니다.");
  const seen = new Set<string>();
  return input.findings.map((finding) => {
    const asked = question.refs.find(
      (ref) => ref.id === finding?.ref?.id && ref.revisionId === finding.ref.revisionId,
    );
    if (!asked) throw new Error(`질문에 없는 지식이나 다른 버전에 대한 판정입니다: ${finding?.ref?.id}`);
    if (seen.has(asked.id)) throw new Error(`같은 지식의 판정이 중복됐습니다: ${asked.id}`);
    seen.add(asked.id);
    if (!DEMONSTRATIONS.includes(finding.result)) throw new Error(`result가 올바르지 않습니다: ${finding.result}`);
    if (!question.scored && finding.result !== "unverified")
      throw new Error("비채점 질문의 응답으로 이해 여부를 판정할 수 없습니다. unverified만 허용합니다.");
    return { ref: asked, result: finding.result, reason: String(finding.reason ?? "").slice(0, 2000) };
  });
}

/**
 * Append one answer. Validation guarantees structure and version links only;
 * the agent remains responsible for recording what the learner actually said.
 */
export async function recordAnswer(
  root: string,
  input: AnswerInput,
  options: { extraChanges?: (evidence: Evidence, question: StoredQuestion) => Promise<PlannedChange[]> } = {},
): Promise<Evidence> {
  if (!input || typeof input.submissionId !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.submissionId))
    throw new Error("submissionId가 필요합니다.");
  const question = await loadQuestion(root, input.questionId);
  if (!question) throw new Error(`질문을 찾지 못했습니다: ${input.questionId}`);
  const file = evidenceFile(question);
  const existing = await readEvidenceFile(root, file);
  const payloadSha256 = sha256(JSON.stringify(input));
  const duplicate = existing.find((e) => e.submissionId === input.submissionId);
  if (duplicate) {
    if (duplicate.payloadSha256 !== payloadSha256)
      throw new Error(`같은 submissionId로 다른 응답을 기록할 수 없습니다: ${input.submissionId}`);
    return duplicate;
  }
  if (typeof input.response !== "string" || !input.response.trim()) throw new Error("response(원 응답)가 필요합니다.");
  if (typeof input.responseAnchor !== "string" || !input.responseAnchor.trim())
    throw new Error("responseAnchor(원 응답 위치)가 필요합니다.");
  if (!ASSISTANCE.includes(input.assistance)) throw new Error(`assistance가 올바르지 않습니다: ${input.assistance}`);
  if (Number.isNaN(Date.parse(input.submittedAt))) throw new Error("submittedAt이 올바른 시각이 아닙니다.");
  if (input.correctionOf && !existing.some((e) => e.submissionId === input.correctionOf))
    throw new Error(`교정 대상 응답을 찾지 못했습니다: ${input.correctionOf}`);
  if (input.confidence !== undefined && !(input.confidence >= 0 && input.confidence <= 1))
    throw new Error("confidence는 0~1 사이여야 합니다.");
  const findings = validateFindings(question, input);
  const chainFindings = (input.chainFindings ?? []).map((c) => {
    if (!question.chainRefs.some((x) => x.chainId === c.chainId && x.revisionId === c.revisionId))
      throw new Error(`질문에 없는 추론 사슬입니다: ${c.chainId}`);
    if (!DEMONSTRATIONS.includes(c.result)) throw new Error(`chain result가 올바르지 않습니다: ${c.result}`);
    return { chainId: c.chainId, revisionId: c.revisionId, result: c.result };
  });
  const evidence: Evidence = {
    schemaVersion: 1,
    id: `e-${sha256(`${question.id}:${input.submissionId}`).slice(0, 20)}`,
    submissionId: input.submissionId,
    payloadSha256,
    questionId: question.id,
    submittedAt: new Date(input.submittedAt).toISOString(),
    response: input.response.slice(0, 50_000),
    responseAnchor: input.responseAnchor.slice(0, 1000),
    assistance: input.assistance,
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    context: { projectId: question.context.projectId, chapterSlug: question.context.chapterSlug, kind: question.purpose },
    criteriaRevision: question.scored ? question.criteriaRevisions.length - 1 : null,
    findings,
    chainFindings,
    ...(input.correctionOf ? { correctionOf: input.correctionOf } : {}),
    ...(input.note ? { note: String(input.note).slice(0, 5000) } : {}),
  };
  const previous = (await readTextOptional(join(root, ...file.split("/")))) ?? "";
  const workspace = await readWorkspace(root);
  const changes: PlannedChange[] = [
    { path: file, after: `${previous}${JSON.stringify(evidence)}\n` },
    ...((await options.extraChanges?.(evidence, question)) ?? []),
  ];
  const plan = await preparePlan(root, `evidence-${evidence.id}`, changes, {
    projectPaths: workspace.manifest.projects.map((p) => p.path),
  });
  await executePlan(root, plan);
  return evidence;
}

async function jsonlFiles(root: string, relativeDir: string): Promise<string[]> {
  try {
    return (await readdir(join(root, ...relativeDir.split("/"))))
      .filter((n) => n.endsWith(".jsonl"))
      .sort()
      .map((n) => `${relativeDir}/${n}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** All recorded answers, read-only. */
export async function listEvidence(
  root: string,
  filter: { questionId?: string; knowledgeId?: string } = {},
): Promise<Evidence[]> {
  const workspace = await readWorkspace(root);
  const files = [
    ...(await jsonlFiles(root, REVIEW_SESSIONS)),
    ...(await Promise.all(workspace.manifest.projects.map((p) => jsonlFiles(root, `${p.path}/.study/dialogue/evidence`)))).flat(),
  ];
  const all = (await Promise.all(files.map((f) => readEvidenceFile(root, f)))).flat();
  return all.filter(
    (e) =>
      (!filter.questionId || e.questionId === filter.questionId) &&
      (!filter.knowledgeId || e.findings.some((f) => f.ref.id === filter.knowledgeId)),
  );
}
