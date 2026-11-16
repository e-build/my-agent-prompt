import { formatAnswerReview, type AnswerReviewItem } from "../evidence/answer-review.ts";
import { listEvidence } from "../evidence/evidence-store.ts";
import type { Demonstration, Evidence } from "../evidence/evidence-types.ts";
import { loadQuestion } from "../evidence/question-store.ts";
import type { DiagnosisRun } from "./dialogue-state.ts";

/** One verdict per answer: findings are per proposition, so mixed results read as partial. */
function verdict(evidence: Evidence): Demonstration {
  const results = new Set(evidence.findings.map((f) => f.result));
  return results.size === 1 ? [...results][0] : "partial";
}

/** The learner's first answer and the latest judgement (a correction may re-judge it) for each question. */
export async function diagnosisAnswerReview(root: string, run: DiagnosisRun): Promise<string> {
  const items: AnswerReviewItem[] = [];
  for (const id of run.questionIds) {
    const question = await loadQuestion(root, id);
    if (!question) continue;
    const evidence = (await listEvidence(root, { questionId: id })).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const original = evidence.find((e) => !e.correctionOf) ?? null;
    const latest = evidence.at(-1) ?? null;
    items.push({
      prompt: question.prompt,
      scored: question.scored,
      ...(question.options ? { options: question.options } : {}),
      response: original?.response ?? null,
      ...(original?.confidence !== undefined ? { confidence: original.confidence } : {}),
      result: latest ? verdict(latest) : null,
      answer: question.criteria?.answer ?? null,
    });
  }
  return formatAnswerReview(items);
}
