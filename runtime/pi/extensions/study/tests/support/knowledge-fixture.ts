import type { KnowledgeItem, SourceRef } from "../../src/knowledge/knowledge-types.ts";

export function source(overrides: Partial<SourceRef> = {}): SourceRef {
  return {
    materialId: "m-redis-docs",
    kind: "url",
    locator: "https://redis.io/docs/latest/develop/use/keyspace/#expiration",
    observedAt: "2026-10-30T00:00:00.000Z",
    basis: "explicit",
    ...overrides,
  };
}

export function knowledgeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    schemaVersion: 1,
    id: "k-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    version: 1,
    revisionId: "rev-1",
    parentRevisionIds: [],
    name: "TTL 만료 후 조회",
    statement: "TTL이 지난 키를 읽으면 값이 없는 것으로 응답한다.",
    conditions: ["Redis 기본 만료 정책"],
    scope: "Redis 단일 노드",
    status: "confirmed",
    explanation: "만료된 키는 접근 시점에 지워진다.",
    aliases: [],
    sources: [source()],
    ...overrides,
  };
}
