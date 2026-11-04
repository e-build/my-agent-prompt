/** Concept tree contracts for the textbook (book). Page bodies live in book/<path>/README.md. */
export type ConceptOwner = "user" | "agent";
export type LearnedIn = { projectId: string; chapterSlug: string; completedOn: string };
/** Reference material outside study chapters (e.g. a migrated Notion page). `path` is root-relative. */
export type SourceMaterial = { kind: "notion" | "file" | "url"; title: string; path?: string; url?: string };

export type ConceptNode = {
  schemaVersion: 1;
  /** `cn-<uuid>`: stable across rename/move. */
  id: string;
  version: number;
  revisionId: string;
  parentRevisionIds: string[];
  name: string;
  /** null: top-level area (user-owned). */
  parentId: string | null;
  owner: ConceptOwner;
  order: number;
  aliases: string[];
  /** Knowledge ids that belong to this page. A proposition belongs to one page only. */
  members: string[];
  learnedIn: LearnedIn[];
  /** Optional for nodes written before reference material existed. */
  sources?: SourceMaterial[];
  related: string[];
  retired?: { into?: string; at: string };
};

export const CONCEPT_ID = /^cn-[a-z0-9-]{4,64}$/;
const FORBIDDEN_NAME = /[\/\\:*?"<>|\u0000-\u001f]/;
const CHAPTER = /^ch-\d+-[a-z0-9-]+$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{2,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NODE_FIELDS = new Set([
  "schemaVersion", "id", "version", "revisionId", "parentRevisionIds", "name", "parentId",
  "owner", "order", "aliases", "members", "learnedIn", "sources", "related", "retired",
]);

export function validateConceptId(id: unknown): string {
  if (typeof id !== "string" || !CONCEPT_ID.test(id)) throw new Error(`개념 ID가 올바르지 않습니다: ${id}`);
  return id;
}

/** Names double as directory names: NFC (macOS stores NFD), no path characters. */
export function normalizeConceptName(name: unknown): string {
  if (typeof name !== "string") throw new Error("개념 이름이 필요합니다.");
  const value = name.normalize("NFC").trim();
  if (!value || value.length > 60) throw new Error("개념 이름은 1~60자여야 합니다.");
  if (FORBIDDEN_NAME.test(value) || value.startsWith(".") || value === "README.md")
    throw new Error(`개념 이름에 쓸 수 없는 문자가 있습니다: ${value}`);
  return value;
}

const SOURCE_PATH = /^(sources|book)\/[^]*$/;

export function validateSource(value: SourceMaterial): SourceMaterial {
  if (!value || !["notion", "file", "url"].includes(value.kind)) throw new Error(`자료 종류가 올바르지 않습니다: ${value?.kind}`);
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 200) throw new Error("자료 제목이 필요합니다.");
  if (value.path !== undefined) {
    const parts = typeof value.path === "string" ? value.path.split("/") : [];
    if (!SOURCE_PATH.test(String(value.path)) || parts.some((p) => !p || p === "." || p === ".."))
      throw new Error(`자료 경로는 sources/ 또는 book/ 아래 상대 경로여야 합니다: ${value.path}`);
  }
  if (value.url !== undefined && !/^https?:\/\//.test(String(value.url))) throw new Error(`자료 URL이 올바르지 않습니다: ${value.url}`);
  if (value.path === undefined && value.url === undefined) throw new Error("자료에는 path나 url이 필요합니다.");
  return { kind: value.kind, title: value.title.trim(), ...(value.path ? { path: value.path } : {}), ...(value.url ? { url: value.url } : {}) };
}

export function validateLearnedIn(value: LearnedIn): LearnedIn {
  if (!value || typeof value.projectId !== "string" || !PROJECT_ID.test(value.projectId))
    throw new Error(`projectId가 올바르지 않습니다: ${value?.projectId}`);
  if (typeof value.chapterSlug !== "string" || !CHAPTER.test(value.chapterSlug))
    throw new Error(`챕터 slug가 올바르지 않습니다: ${value.chapterSlug}`);
  if (typeof value.completedOn !== "string" || !DATE.test(value.completedOn))
    throw new Error(`completedOn은 YYYY-MM-DD여야 합니다: ${value.completedOn}`);
  return { projectId: value.projectId, chapterSlug: value.chapterSlug, completedOn: value.completedOn };
}

function ids(value: unknown, field: string, pattern: RegExp): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} 목록이 필요합니다.`);
  for (const id of value) if (typeof id !== "string" || !pattern.test(id)) throw new Error(`${field}의 ID가 올바르지 않습니다: ${id}`);
  if (new Set(value).size !== value.length) throw new Error(`${field}에 중복 ID가 있습니다.`);
  return value;
}

export function validateConceptNode(value: ConceptNode): ConceptNode {
  if (!value || typeof value !== "object") throw new Error("개념 노드가 올바르지 않습니다.");
  for (const key of Object.keys(value)) if (!NODE_FIELDS.has(key)) throw new Error(`알 수 없는 개념 필드입니다: ${key}`);
  if (value.schemaVersion !== 1) throw new Error("개념 schemaVersion은 1이어야 합니다.");
  validateConceptId(value.id);
  if (!Number.isInteger(value.version) || value.version < 1) throw new Error(`${value.id}: version이 올바르지 않습니다.`);
  if (typeof value.revisionId !== "string" || !value.revisionId) throw new Error(`${value.id}: revisionId가 필요합니다.`);
  if (value.name !== normalizeConceptName(value.name)) throw new Error(`${value.id}: 이름이 정규화되지 않았습니다.`);
  if (value.parentId !== null) validateConceptId(value.parentId);
  if (value.owner !== "user" && value.owner !== "agent") throw new Error(`${value.id}: owner가 올바르지 않습니다.`);
  if (value.parentId === null && value.owner !== "user") throw new Error(`${value.id}: 최상위 영역은 사용자 소유여야 합니다.`);
  if (!Number.isInteger(value.order)) throw new Error(`${value.id}: order가 올바르지 않습니다.`);
  if (!Array.isArray(value.aliases) || value.aliases.some((a) => typeof a !== "string")) throw new Error(`${value.id}: aliases가 올바르지 않습니다.`);
  ids(value.members, "members", /^k-[a-z0-9-]{4,64}$/);
  ids(value.related, "related", CONCEPT_ID);
  if (!Array.isArray(value.learnedIn)) throw new Error(`${value.id}: learnedIn 목록이 필요합니다.`);
  value.learnedIn.forEach(validateLearnedIn);
  if (value.sources !== undefined) {
    if (!Array.isArray(value.sources)) throw new Error(`${value.id}: sources 목록이 올바르지 않습니다.`);
    value.sources.forEach(validateSource);
  }
  if (value.retired && value.retired.into !== undefined) validateConceptId(value.retired.into);
  return value;
}
