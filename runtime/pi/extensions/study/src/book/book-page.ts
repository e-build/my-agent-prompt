import { sha256 } from "../workspace/atomic-file.ts";

/**
 * A book page = frontmatter + three managed regions + free notes.
 * head (breadcrumb, title, children) and foot (배운 곳) are generated;
 * main is the agent's rewritten body. Anything after the last region is the
 * learner's notes and is never rewritten.
 */
export type RegionId = "head" | "main" | "foot";
export const REGION_IDS: RegionId[] = ["head", "main", "foot"];
export type PageRegion = { body: string; hash: string; edited: boolean };
export type ParsedPage = { conceptId: string; regions: Record<RegionId, PageRegion>; notes: string };

const FRONTMATTER = /^---\nconcept: (cn-[a-z0-9-]{4,64})\n---\n/;
const OPEN = /<!-- study:book region=(head|main|foot) hash=([0-9a-f]{12}) -->\n/g;
const CLOSE = "<!-- /study:book -->";
const MARKER = /<!--\s*\/?study:book/;
export const DEFAULT_NOTES = "## 메모\n";

export function bodyHash(body: string): string {
  return sha256(body).slice(0, 12);
}

export function assertBodySafe(body: string): string {
  if (typeof body !== "string") throw new Error("페이지 본문은 문자열이어야 합니다.");
  if (body.length > 60_000) throw new Error("페이지 본문이 60000자를 넘습니다.");
  if (MARKER.test(body) || /^---\nconcept:/.test(body)) throw new Error("본문에 관리 영역 표시를 넣을 수 없습니다.");
  return body.trim();
}

export function region(id: RegionId, body: string, hash = bodyHash(body)): string {
  return `<!-- study:book region=${id} hash=${hash} -->\n${body}\n${CLOSE}`;
}

export function renderPage(page: { conceptId: string; regions: Record<RegionId, { body: string; hash?: string }>; notes: string }): string {
  const parts = REGION_IDS.map((id) => region(id, page.regions[id].body, page.regions[id].hash));
  const notes = page.notes.trim() ? page.notes.replace(/^\n+/, "") : DEFAULT_NOTES;
  return `---\nconcept: ${page.conceptId}\n---\n${parts.join("\n\n")}\n\n${notes.endsWith("\n") ? notes : `${notes}\n`}`;
}

export function parsePage(content: string): ParsedPage {
  const front = FRONTMATTER.exec(content);
  if (!front) throw new Error("교과서 페이지 머리말(concept)이 없습니다.");
  const regions = {} as Record<RegionId, PageRegion>;
  let end = front[0].length;
  for (const match of content.matchAll(OPEN)) {
    const id = match[1] as RegionId;
    if (regions[id]) throw new Error(`관리 영역이 중복됐습니다: ${id}`);
    const start = match.index! + match[0].length;
    const close = content.indexOf(`\n${CLOSE}`, start - 1);
    if (close < start - 1) throw new Error(`관리 영역이 닫히지 않았습니다: ${id}`);
    const body = content.slice(start, Math.max(start, close));
    if (MARKER.test(body)) throw new Error("관리 영역 표시가 손상됐습니다. 자동 수정하지 않습니다.");
    regions[id] = { body, hash: match[2], edited: bodyHash(body) !== match[2] };
    end = close + 1 + CLOSE.length;
  }
  for (const id of REGION_IDS) if (!regions[id]) throw new Error(`관리 영역이 없습니다: ${id}`);
  const notes = content.slice(end).replace(/^\n+/, "");
  if (MARKER.test(notes)) throw new Error("관리 영역 표시가 손상됐습니다. 자동 수정하지 않습니다.");
  return { conceptId: front[1], regions, notes };
}
