import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LearningCard } from "../channel/channel.ts";

export type Criterion = { answer: string; acceptable?: string[]; rubric: string };
export type Assistance = "independent" | "hinted" | "explained" | "unknown";
export type Finding = "demonstrated" | "partial" | "incorrect" | "unverified";

export type AnswerInput = {
  cardId: string;
  itemId: string;
  response: string;
  confidence?: number;
  assistance: Assistance;
  result: Finding;
  score?: number;
  reason: string;
  /** "first" or the `at` of the answer being corrected. */
  correctionOf?: string;
};
export type Answer = AnswerInput & { at: string };

export type StoredCard = {
  card: LearningCard;
  criteria?: Record<string, Criterion>;
  status: "undelivered" | "delivered";
  ref?: string;
  fallback?: string;
};
export type Scope = { cards: Record<string, StoredCard>; answers: Answer[] };

type Event =
  | { type: "card"; card: LearningCard; criteria?: Record<string, Criterion>; at: string }
  | { type: "delivered"; cardId: string; ref: string; fallback?: string; at: string }
  | ({ type: "answer" } & Answer);

const ASSISTANCE: Assistance[] = ["independent", "hinted", "explained", "unknown"];
const FINDINGS: Finding[] = ["demonstrated", "partial", "incorrect", "unverified"];
const SCOPE = /^(placement|ch-[0-9]{2}-[a-z0-9-]+)$/;
export const CONFIDENCE_ITEM = "confidence";

export function scopeOf(card: LearningCard): string {
  return card.chapterSlug ?? "placement";
}

function scopePath(projectRoot: string, scope: string): string {
  if (!SCOPE.test(scope)) throw new Error(`잘못된 카드 scope입니다: ${scope}`);
  return join(projectRoot, ".study", "cards", `${scope}.jsonl`);
}

async function append(projectRoot: string, scope: string, event: Event): Promise<void> {
  const path = scopePath(projectRoot, scope);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readScope(projectRoot: string, scope: string): Promise<Scope> {
  const path = scopePath(projectRoot, scope);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { cards: {}, answers: [] };
    throw error;
  }
  const result: Scope = { cards: {}, answers: [] };
  text
    .split("\n")
    .filter(Boolean)
    .forEach((line, index) => {
      let event: Event;
      try {
        event = JSON.parse(line);
      } catch {
        throw new Error(`카드 기록이 손상됐습니다: ${path}:${index + 1}`);
      }
      if (event.type === "card")
        result.cards[event.card.id] = {
          card: event.card,
          criteria: event.criteria,
          status: "undelivered",
        };
      else if (event.type === "delivered") {
        const stored = result.cards[event.cardId];
        if (stored) Object.assign(stored, { status: "delivered", ref: event.ref, fallback: event.fallback });
      } else {
        const { type: _type, ...answer } = event;
        result.answers.push(answer);
      }
    });
  return result;
}

/** Stores the card and its hidden criteria. Must complete before the card is delivered. */
export async function createCard(
  projectRoot: string,
  card: LearningCard,
  criteria?: Record<string, Criterion>,
): Promise<void> {
  if (card.kind === "question") {
    if (!card.items.length) throw new Error(`문항이 없는 질문 카드입니다: ${card.id}`);
    for (const item of card.items) {
      const c = criteria?.[item.id];
      if (!c || !c.answer?.trim() || !c.rubric?.trim())
        throw new Error(`문항 ${item.id}의 채점 기준(answer, rubric)이 필요합니다.`);
    }
  }
  const scope = scopeOf(card);
  const existing = (await readScope(projectRoot, scope)).cards[card.id];
  if (existing) {
    if (JSON.stringify(existing.card) === JSON.stringify(card) && JSON.stringify(existing.criteria) === JSON.stringify(criteria))
      return;
    throw new Error(`같은 ID(${card.id})의 다른 카드가 이미 있습니다. 내용을 바꾸면 새 ID를 쓰세요.`);
  }
  await append(projectRoot, scope, { type: "card", card, criteria, at: new Date().toISOString() });
}

export async function markDelivered(
  projectRoot: string,
  scope: string,
  cardId: string,
  delivery: { ref: string; fallback?: string },
): Promise<void> {
  if (!(await readScope(projectRoot, scope)).cards[cardId])
    throw new Error(`카드를 찾지 못했습니다: ${cardId}`);
  await append(projectRoot, scope, { type: "delivered", cardId, ...delivery, at: new Date().toISOString() });
}

export async function appendAnswer(
  projectRoot: string,
  scope: string,
  input: AnswerInput,
): Promise<Answer> {
  const current = await readScope(projectRoot, scope);
  const stored = current.cards[input.cardId];
  if (!stored || stored.card.kind !== "question")
    throw new Error(`질문 카드를 찾지 못했습니다: ${input.cardId}`);
  const item = stored.card.items.find((i) => i.id === input.itemId);
  const isConfidence = input.itemId === CONFIDENCE_ITEM && stored.card.askConfidence;
  if (!item && !isConfidence) throw new Error(`카드 ${input.cardId}에 문항 ${input.itemId}이 없습니다.`);
  if (!ASSISTANCE.includes(input.assistance))
    throw new Error(`assistance는 ${ASSISTANCE.join("|")} 중 하나여야 합니다.`);
  if (!FINDINGS.includes(input.result)) throw new Error(`result는 ${FINDINGS.join("|")} 중 하나여야 합니다.`);
  if (input.confidence !== undefined && !(input.confidence >= 0 && input.confidence <= 1))
    throw new Error("confidence는 0~1 사이여야 합니다(학습자가 말한 0~10 ÷ 10).");
  if (input.score !== undefined) {
    const max = item?.maxScore;
    if (!(input.score >= 0) || (max !== undefined && input.score > max))
      throw new Error(`score는 0~${max ?? "∞"} 사이여야 합니다: ${input.score}`);
  }
  const previous = current.answers.some((a) => a.cardId === input.cardId && a.itemId === input.itemId);
  if (previous && !input.correctionOf)
    throw new Error(`문항 ${input.itemId}에는 이미 응답이 있습니다. 교정이면 correctionOf를 지정하세요.`);
  const answer: Answer = { ...input, at: new Date().toISOString() };
  await append(projectRoot, scope, { type: "answer", ...answer });
  return answer;
}
