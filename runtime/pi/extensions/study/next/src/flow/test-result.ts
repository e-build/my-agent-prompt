import type { Scope } from "../cards/card-store.ts";

export type TestResult = {
  total: number;
  max: number;
  passScore: number;
  passed: boolean;
  weak: string[];
};

/** Scores come from the first recorded answer per item; corrections never raise a test score. */
export function computeTestResult(scope: Scope, cardId: string, passScore: number): TestResult {
  const stored = scope.cards[cardId];
  if (!stored || stored.card.kind !== "question") throw new Error(`시험 카드를 찾지 못했습니다: ${cardId}`);
  if (stored.card.purpose !== "test") throw new Error(`test 카드가 아닙니다: ${cardId}`);
  const missing: string[] = [];
  let total = 0;
  let max = 0;
  const weak: string[] = [];
  for (const item of stored.card.items) {
    if (item.maxScore === undefined) throw new Error(`문항 ${item.id}에 maxScore가 없습니다.`);
    max += item.maxScore;
    const first = scope.answers.find((a) => a.cardId === cardId && a.itemId === item.id && !a.correctionOf);
    if (first?.score === undefined) {
      missing.push(item.id);
      continue;
    }
    total += first.score;
    if (first.score < item.maxScore) weak.push(item.id);
  }
  if (missing.length) throw new Error(`점수가 기록되지 않은 문항: ${missing.join(", ")}`);
  if (!(passScore >= 0 && passScore <= max)) throw new Error(`passScore는 0~${max} 사이여야 합니다.`);
  return { total, max, passScore, passed: total >= passScore, weak };
}
