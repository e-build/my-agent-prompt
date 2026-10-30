import { sha256 } from "../workspace/atomic-file.ts";
import type { KnowledgeItem, KnowledgeRef } from "./knowledge-types.ts";

const OPEN = /<!-- study:knowledge region=([a-z0-9-]{1,64}) refs=([^ ]*) hash=([0-9a-f]{12}) -->\n/g;
const CLOSE = "<!-- /study:knowledge -->";

export type ParsedRegion = {
  regionId: string;
  refs: Array<Pick<KnowledgeRef, "id" | "version">>;
  hash: string;
  start: number;
  end: number;
  body: string;
  /** Body hash no longer matches the hash recorded when it was generated. */
  edited: boolean;
};

function bodyHash(body: string): string {
  return sha256(body).slice(0, 12);
}

function escapeMarkers(value: string): string {
  return value.replace(/<!--\s*\/?study:knowledge/g, "&lt;!-- study:knowledge");
}

export function renderBody(items: KnowledgeItem[]): string {
  return items
    .map((item) => {
      const conditions = item.conditions.length ? `\n\n- 조건: ${item.conditions.join("; ")}` : "";
      const scope = item.scope ? `\n- 범위: ${item.scope}` : "";
      const explanation = item.explanation.trim() ? `\n\n${item.explanation.trim()}` : "";
      return escapeMarkers(`**${item.name}** — ${item.statement}${conditions}${scope}${explanation}`);
    })
    .join("\n\n");
}

export function renderRegion(regionId: string, items: KnowledgeItem[]): string {
  if (!/^[a-z0-9-]{1,64}$/.test(regionId)) throw new Error(`regionId가 올바르지 않습니다: ${regionId}`);
  if (!items.length) throw new Error("교재 영역에는 지식이 하나 이상 필요합니다.");
  const blocked = items.find((item) => item.status !== "confirmed" || item.mergedInto);
  if (blocked) throw new Error(`확정되지 않은 지식은 교재에 쓰지 않습니다: ${blocked.id} (${blocked.status})`);
  const body = renderBody(items);
  const refs = items.map((item) => `${item.id}@v${item.version}`).join(",");
  return `<!-- study:knowledge region=${regionId} refs=${refs} hash=${bodyHash(body)} -->\n${body}\n${CLOSE}`;
}

export function parseRegions(content: string): ParsedRegion[] {
  const regions: ParsedRegion[] = [];
  const ids = new Set<string>();
  for (const match of content.matchAll(OPEN)) {
    const start = match.index!;
    const bodyStart = start + match[0].length;
    const closeIndex = content.indexOf(`\n${CLOSE}`, bodyStart - 1);
    const nextOpen = content.slice(bodyStart).search(/<!-- study:knowledge region=/);
    if (closeIndex < 0 || (nextOpen >= 0 && bodyStart + nextOpen < closeIndex))
      throw new Error(`교재 관리 영역이 닫히지 않았습니다: ${match[1]}. 자동 수정하지 않습니다.`);
    if (ids.has(match[1])) throw new Error(`교재 관리 영역이 중복됐습니다: ${match[1]}`);
    ids.add(match[1]);
    const body = content.slice(bodyStart, closeIndex);
    const refs = match[2].split(",").filter(Boolean).map((value) => {
      const [id, version] = value.split("@v");
      return { id, version: Number(version) };
    });
    regions.push({
      regionId: match[1],
      refs,
      hash: match[3],
      start,
      end: closeIndex + 1 + CLOSE.length,
      body,
      edited: bodyHash(body) !== match[3],
    });
  }
  const opens = (content.match(/<!-- study:knowledge region=/g) ?? []).length;
  const closes = content.split(CLOSE).length - 1;
  if (opens !== regions.length || closes !== regions.length)
    throw new Error("교재 관리 영역 표시가 손상됐습니다. 자동 수정하지 않습니다.");
  return regions;
}

export type RegionRefreshPlan = {
  content: string;
  updated: string[];
  deferred: Array<{ regionId: string; current: string; proposed: string }>;
  blocked: Array<{ regionId: string; reason: string }>;
  missing: string[];
};

/** Replace unedited regions whose content changed; defer edited ones. Pure. */
export function planRegionRefresh(
  content: string,
  desired: Map<string, KnowledgeItem[]>,
): RegionRefreshPlan {
  const regions = parseRegions(content);
  const plan: RegionRefreshPlan = { content, updated: [], deferred: [], blocked: [], missing: [] };
  let next = content;
  for (const region of [...regions].reverse()) {
    const items = desired.get(region.regionId);
    if (!items) continue;
    let rendered: string;
    try {
      rendered = renderRegion(region.regionId, items);
    } catch (error) {
      plan.blocked.push({ regionId: region.regionId, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const proposedBody = renderBody(items);
    if (proposedBody === region.body && !region.edited) {
      if (next.slice(region.start, region.end) !== rendered) {
        next = next.slice(0, region.start) + rendered + next.slice(region.end);
        plan.updated.push(region.regionId);
      }
      continue;
    }
    if (region.edited) {
      plan.deferred.push({ regionId: region.regionId, current: region.body, proposed: proposedBody });
      continue;
    }
    next = next.slice(0, region.start) + rendered + next.slice(region.end);
    plan.updated.push(region.regionId);
  }
  plan.updated.reverse();
  plan.deferred.reverse();
  plan.blocked.reverse();
  const present = new Set(regions.map((r) => r.regionId));
  plan.missing = [...desired.keys()].filter((id) => !present.has(id));
  plan.content = next;
  return plan;
}

/** Insert missing regions right after a heading line (explicit placement only). */
export function insertRegionsAfterHeading(content: string, heading: string, regions: string[]): string {
  const lines = content.split("\n");
  const index = lines.findIndex((line) => line.trim() === heading.trim());
  if (index < 0) throw new Error(`삽입 위치 제목을 찾지 못했습니다: ${heading}`);
  return [...lines.slice(0, index + 1), "", ...regions.flatMap((r) => [r, ""]), ...lines.slice(index + 1)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
