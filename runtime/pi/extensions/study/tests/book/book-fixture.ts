import type { ConceptNode } from "../../src/book/book-types.ts";

export function conceptNode(overrides: Partial<ConceptNode> = {}): ConceptNode {
  return {
    schemaVersion: 1,
    id: "cn-area0001",
    version: 1,
    revisionId: "rev-1",
    parentRevisionIds: [],
    name: "동시성",
    parentId: null,
    owner: "user",
    order: 0,
    aliases: [],
    members: [],
    learnedIn: [],
    related: [],
    ...overrides,
  };
}
