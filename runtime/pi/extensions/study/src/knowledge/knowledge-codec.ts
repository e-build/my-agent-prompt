import type { KnowledgeItem } from "./knowledge-types.ts";
import { validateKnowledgeItem } from "./knowledge-validation.ts";

const OPEN = "<!-- study:knowledge-meta";
const CLOSE = "-->";

/**
 * `knowledge/items/<id>.md`: a fixed JSON metadata comment followed by the
 * Markdown explanation. JSON escapes `-->` so the comment cannot end early.
 */
export function encodeKnowledgeItem(item: KnowledgeItem): string {
  const { explanation, ...meta } = validateKnowledgeItem(item);
  const json = JSON.stringify(meta, null, 2).replace(/-->/g, "--\\u003e");
  return `${OPEN}\n${json}\n${CLOSE}\n\n# ${oneLine(item.name)}\n\n${explanation}\n`;
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function decodeKnowledgeItem(content: string): KnowledgeItem {
  if (!content.startsWith(`${OPEN}\n`)) throw new Error("지식 파일 메타데이터 구역이 없습니다.");
  const end = content.indexOf(`\n${CLOSE}\n`, OPEN.length);
  if (end < 0) throw new Error("지식 파일 메타데이터 구역이 닫히지 않았습니다.");
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(content.slice(OPEN.length + 1, end));
  } catch {
    throw new Error("지식 파일 메타데이터 JSON이 손상됐습니다.");
  }
  const rest = content.slice(end + CLOSE.length + 2);
  const heading = rest.match(/^\n# [^\n]*\n\n/);
  if (!heading) throw new Error("지식 파일 제목 구역이 손상됐습니다.");
  const explanation = rest.slice(heading[0].length).replace(/\n$/, "");
  return validateKnowledgeItem({ ...(meta as object), explanation } as KnowledgeItem);
}
