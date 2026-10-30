import type { TestContext } from "node:test";
import { applyKnowledgeChange } from "../../src/knowledge/knowledge-changes.ts";
import { refOf, type KnowledgeItem } from "../../src/knowledge/knowledge-types.ts";
import { source } from "./knowledge-fixture.ts";
import { workspaceFixture } from "./workspace-fixture.ts";

export async function knowledgeWorkspace(t: TestContext) {
  const root = await workspaceFixture(t);
  const make = async (changeId: string, name: string, status: "confirmed" | "uncertain" = "confirmed") =>
    (
      await applyKnowledgeChange(root, {
        changeId,
        operation: "create",
        reason: "교재",
        item: {
          name,
          statement: `${name} 명제`,
          conditions: [],
          scope: "Redis",
          status,
          explanation: `${name} 설명`,
          aliases: [],
          sources: status === "confirmed" ? [source()] : [],
        },
      })
    ).items[0] as KnowledgeItem;
  const a = await make("k1", "TTL");
  const b = await make("k2", "Lazy expiry");
  const u = await make("k3", "후보", "uncertain");
  return { root, a, b, u, refA: refOf(a), refB: refOf(b), refU: refOf(u) };
}

export function scoredQuestion(refs: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    requestId: "req-1",
    purpose: "diagnosis",
    scored: true,
    prompt: "TTL이 지난 키를 GET하면?",
    options: [
      { id: "A", text: "nil" },
      { id: "B", text: "이전 값" },
    ],
    refs,
    criteria: {
      answer: "A",
      acceptable: ["값 없음"],
      rubric: "만료된 키는 없는 것으로 응답함을 설명",
      conditions: ["Redis 기본 만료"],
    },
    context: { projectSlug: "study-alpha", chapterSlug: "ch-01-intro" },
    ...overrides,
  };
}
