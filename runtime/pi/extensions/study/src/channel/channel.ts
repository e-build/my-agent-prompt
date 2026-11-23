export type QuestionItem = {
  id: string;
  prompt: string;
  context?: string;
  choices?: string[];
  multi?: boolean;
  maxScore?: number;
};

type CardBase = { id: string; projectSlug: string; chapterSlug?: string };

export type QuestionPurpose = "placement" | "concept-check" | "test" | "review";

export type QuestionCard = CardBase & {
  kind: "question";
  purpose: QuestionPurpose;
  items: QuestionItem[];
  askConfidence: boolean;
};

export type LessonCard = CardBase & {
  kind: "lesson";
  title: string;
  summary: string;
  attachments: string[];
};

export type NoticeCard = CardBase & { kind: "notice"; title: string; body: string };

/** Channel-neutral unit the core hands to an adapter. Never carries grading criteria. */
export type LearningCard = QuestionCard | LessonCard | NoticeCard;

export type Delivery = { ref: string; publicText: string; fallback?: string };

/** Sends cards to the learner. Adapters never read replies; the agent records them. */
export interface Channel {
  id: string;
  available(): Promise<boolean>;
  deliver(card: LearningCard): Promise<Delivery>;
}

export const itemMarker = (cardId: string, itemId: string) => `[${cardId}/${itemId}]`;
