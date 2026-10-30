import {
  KNOWLEDGE_STATUSES,
  SOURCE_BASES,
  SOURCE_KINDS,
  type KnowledgeChain,
  type KnowledgeItem,
  type KnowledgeRef,
  type SourceRef,
} from "./knowledge-types.ts";

export const KNOWLEDGE_ID = /^k-[a-z0-9-]{4,64}$/;
const REVISION_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const ITEM_FIELDS = new Set([
  "schemaVersion",
  "id",
  "version",
  "revisionId",
  "parentRevisionIds",
  "name",
  "statement",
  "conditions",
  "scope",
  "status",
  "explanation",
  "aliases",
  "sources",
  "mergedInto",
]);

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()))
    throw new Error(`${field}는 비어 있지 않은 문자열이어야 합니다.`);
  if (value.length > max) throw new Error(`${field} 길이가 ${max}자를 넘습니다.`);
  return value;
}

function list(value: unknown, field: string, max: number, itemMax: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${field} 목록이 올바르지 않습니다.`);
  return value.map((entry, index) => text(entry, `${field}[${index}]`, itemMax));
}

export function validateKnowledgeId(id: unknown): string {
  if (typeof id !== "string" || !KNOWLEDGE_ID.test(id)) throw new Error(`지식 ID가 올바르지 않습니다: ${id}`);
  return id;
}

export function validateSource(value: unknown, index = 0): SourceRef {
  const source = value as Record<string, unknown>;
  if (!source || typeof source !== "object") throw new Error(`출처[${index}]가 객체가 아닙니다.`);
  if (!SOURCE_KINDS.includes(source.kind as SourceRef["kind"]))
    throw new Error(`출처[${index}] kind가 올바르지 않습니다: ${source.kind}`);
  if (!SOURCE_BASES.includes(source.basis as SourceRef["basis"]))
    throw new Error(`출처[${index}] basis가 올바르지 않습니다: ${source.basis}`);
  return {
    materialId: text(source.materialId, `출처[${index}].materialId`, 200),
    kind: source.kind as SourceRef["kind"],
    locator: text(source.locator, `출처[${index}].locator`, 1000),
    observedAt: text(source.observedAt, `출처[${index}].observedAt`, 40),
    ...(source.digest !== undefined ? { digest: text(source.digest, `출처[${index}].digest`, 128) } : {}),
    basis: source.basis as SourceRef["basis"],
  };
}

/**
 * Structural validation only. Passing it does not certify truth; it guarantees
 * that confirmed claims carry non-hypothetical sources and that IDs are safe.
 */
export function validateKnowledgeItem(value: KnowledgeItem): KnowledgeItem {
  if (!value || typeof value !== "object") throw new Error("지식 항목은 객체여야 합니다.");
  for (const key of Object.keys(value))
    if (!ITEM_FIELDS.has(key)) throw new Error(`알 수 없는 필드입니다: ${key}`);
  if (value.schemaVersion !== 1) throw new Error("지식 schemaVersion은 1이어야 합니다.");
  validateKnowledgeId(value.id);
  if (!Number.isInteger(value.version) || value.version < 1) throw new Error("version은 1 이상의 정수여야 합니다.");
  if (typeof value.revisionId !== "string" || !REVISION_ID.test(value.revisionId))
    throw new Error("revisionId가 올바르지 않습니다.");
  const parents = list(value.parentRevisionIds, "parentRevisionIds", 8, 80);
  if (!KNOWLEDGE_STATUSES.includes(value.status)) throw new Error(`status가 올바르지 않습니다: ${value.status}`);
  if (!Array.isArray(value.sources) || value.sources.length > 50) throw new Error("sources 목록이 올바르지 않습니다.");
  const sources = value.sources.map(validateSource);
  if (value.status === "confirmed") {
    if (!sources.length) throw new Error("confirmed 지식에는 출처가 필요합니다. 근거가 부족하면 uncertain으로 두세요.");
    if (sources.every((s) => s.basis === "hypothesis"))
      throw new Error("가설 출처만으로는 confirmed가 될 수 없습니다.");
  }
  if (value.mergedInto !== undefined) {
    validateKnowledgeId(value.mergedInto);
    if (value.mergedInto === value.id) throw new Error("자기 자신에게 병합할 수 없습니다.");
  }
  return {
    schemaVersion: 1,
    id: value.id,
    version: value.version,
    revisionId: value.revisionId,
    parentRevisionIds: parents,
    name: text(value.name, "name", 200),
    statement: text(value.statement, "statement", 5000),
    conditions: list(value.conditions, "conditions", 20, 1000),
    scope: text(value.scope, "scope", 1000, true),
    status: value.status,
    explanation: text(value.explanation, "explanation", 50_000, true),
    aliases: list(value.aliases, "aliases", 50, 5000),
    sources,
    ...(value.mergedInto !== undefined ? { mergedInto: value.mergedInto } : {}),
  };
}

export function validateRef(value: unknown, field = "ref"): KnowledgeRef {
  const ref = value as KnowledgeRef;
  validateKnowledgeId(ref?.id);
  if (!Number.isInteger(ref.version) || ref.version < 1) throw new Error(`${field}.version이 올바르지 않습니다.`);
  if (typeof ref.revisionId !== "string" || !REVISION_ID.test(ref.revisionId))
    throw new Error(`${field}.revisionId가 올바르지 않습니다.`);
  return { id: ref.id, version: ref.version, revisionId: ref.revisionId };
}

export function chainPremiseKey(chain: Pick<KnowledgeChain, "premiseRefs" | "conclusionRef">): string {
  return `${[...new Set(chain.premiseRefs.map((r) => r.id))].sort().join("+")}=>${chain.conclusionRef.id}`;
}

export function validateChain(value: KnowledgeChain): KnowledgeChain {
  if (!value || typeof value.id !== "string" || !/^c-[a-z0-9-]{1,64}$/.test(value.id))
    throw new Error(`추론 사슬 ID가 올바르지 않습니다: ${value?.id}`);
  if (!Array.isArray(value.premiseRefs) || !value.premiseRefs.length)
    throw new Error("추론 사슬에는 전제가 하나 이상 필요합니다.");
  const premises = value.premiseRefs.map((r, i) => validateRef(r, `premiseRefs[${i}]`));
  if (new Set(premises.map((p) => p.id)).size !== premises.length) throw new Error("전제가 중복됐습니다.");
  const conclusion = validateRef(value.conclusionRef, "conclusionRef");
  if (premises.some((p) => p.id === conclusion.id)) throw new Error("결론이 자기 자신을 전제로 삼을 수 없습니다.");
  if (!Array.isArray(value.sourceRefs) || !value.sourceRefs.length)
    throw new Error("근거 없는 추론 사슬은 만들 수 없습니다.");
  return {
    id: value.id,
    premiseRefs: premises,
    conclusionRef: conclusion,
    sourceRefs: value.sourceRefs.map(validateSource),
    revisionId: text(value.revisionId, "revisionId", 80),
    ...(value.retired ? { retired: true } : {}),
  };
}

/** Each active premise set → conclusion is unique; IDs are unique. */
export function validateChains(chains: KnowledgeChain[]): KnowledgeChain[] {
  const ids = new Set<string>();
  const keys = new Set<string>();
  return chains.map((chain) => {
    const valid = validateChain(chain);
    if (ids.has(valid.id)) throw new Error(`중복 추론 사슬 ID입니다: ${valid.id}`);
    ids.add(valid.id);
    if (!valid.retired) {
      const key = chainPremiseKey(valid);
      if (keys.has(key)) throw new Error(`같은 전제 묶음과 결론의 추론 사슬이 이미 있습니다: ${key}`);
      keys.add(key);
    }
    return valid;
  });
}

export function validateRedirects(redirects: Map<string, string>): void {
  for (const start of redirects.keys()) {
    const seen = new Set<string>([start]);
    let current = redirects.get(start);
    while (current) {
      if (seen.has(current)) throw new Error(`병합 연결이 순환합니다: ${[...seen, current].join(" → ")}`);
      seen.add(current);
      current = redirects.get(current);
    }
  }
}
