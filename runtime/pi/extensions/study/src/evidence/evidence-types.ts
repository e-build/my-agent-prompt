import type { KnowledgeRef } from "../knowledge/knowledge-types.ts";

export type QuestionPurpose = "diagnosis" | "concept-check" | "prediction" | "review" | "lab" | "test";
export type Assistance = "independent" | "hinted" | "explained" | "unknown";
export type Demonstration = "demonstrated" | "partial" | "incorrect" | "unverified";

export const PURPOSES: QuestionPurpose[] = ["diagnosis", "concept-check", "prediction", "review", "lab", "test"];
export const ASSISTANCE: Assistance[] = ["independent", "hinted", "explained", "unknown"];
export const DEMONSTRATIONS: Demonstration[] = ["demonstrated", "partial", "incorrect", "unverified"];

export type Criteria = {
  answer: string;
  acceptable: string[];
  rubric: string;
  conditions: string[];
};

export type QuestionContext = { projectSlug?: string; chapterSlug?: string };

export type StoredQuestion = {
  schemaVersion: 1;
  id: string;
  requestId: string;
  payloadSha256: string;
  purpose: QuestionPurpose;
  scored: boolean;
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  refs: KnowledgeRef[];
  chainRefs: Array<{ chainId: string; revisionId: string }>;
  /** Current criteria; null for unscored questions. */
  criteria: Criteria | null;
  /** Append-only: the first entry is the criteria fixed before asking. */
  criteriaRevisions: Array<{ criteria: Criteria; reason: string; at: string }>;
  context: { projectId?: string; projectSlug?: string; chapterSlug?: string };
  location: string;
  createdAt: string;
};

/** What the learner may see before answering. */
export type PublicQuestion = {
  id: string;
  purpose: QuestionPurpose;
  scored: boolean;
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  refs: Array<Pick<KnowledgeRef, "id" | "version">>;
  context: StoredQuestion["context"];
};

export type Finding = { ref: KnowledgeRef; result: Demonstration; reason: string };
export type ChainFinding = { chainId: string; revisionId: string; result: Demonstration };

export type Evidence = {
  schemaVersion: 1;
  id: string;
  submissionId: string;
  payloadSha256: string;
  questionId: string;
  submittedAt: string;
  response: string;
  /** Where the original answer lives (conversation message, record file). */
  responseAnchor: string;
  assistance: Assistance;
  confidence?: number;
  context: { projectId?: string; chapterSlug?: string; kind: QuestionPurpose };
  /** Index into the question's criteriaRevisions used for this judgement. */
  criteriaRevision: number | null;
  findings: Finding[];
  chainFindings: ChainFinding[];
  correctionOf?: string;
  note?: string;
};
