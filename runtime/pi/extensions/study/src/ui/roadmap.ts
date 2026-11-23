import { basename } from "node:path";
import { PHASE_KO, type CatalogChapter, type ChapterCatalog } from "./chapter-catalog.ts";

/** Project roadmap derived from README phases + the README Mermaid dependency map. */
export type RoadmapModel = {
  phases: Array<{ title: string; chapters: string[] }>;
  /** chapter number → prerequisite chapter numbers (solid edges only) */
  prerequisites: Map<string, string[]>;
  /** chapters: nodes are chapters; concepts: map exists but nodes are concepts; none: no map */
  dependencySource: "chapters" | "concepts" | "none";
};

const CHAPTER_REF = /\bch[-\s]*0*(\d{1,3})\b/gi;

function chapterNumbers(text: string, known: Set<string>): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(CHAPTER_REF)) {
    const n = m[1].padStart(2, "0");
    if (known.has(n) && !found.includes(n)) found.push(n);
  }
  return found;
}

function mermaidBlock(readme: string): string | null {
  const section = readme.split(/^## .*의존.*$/m)[1] ?? readme;
  return section.match(/```mermaid\n([\s\S]*?)```/)?.[1] ?? null;
}

/** Phase headings (## or ###) and the chapters they mention, in document order. */
function readPhases(readme: string, known: Set<string>) {
  const phases: Array<{ title: string; chapters: string[] }> = [];
  const body = readme.split(/^## .*의존.*$/m)[0];
  let current: { title: string; chapters: string[] } | null = null;
  for (const line of body.split("\n")) {
    const heading = line.match(/^#{2,3}\s+(Phase\s*\d+.*)$/i);
    if (heading) {
      current = { title: heading[1].replace(/\*\*/g, "").trim(), chapters: [] };
      phases.push(current);
      continue;
    }
    if (/^##\s/.test(line) && !/^###/.test(line)) current = null;
    if (!current) continue;
    for (const n of chapterNumbers(line, known)) {
      if (!phases.some((p) => p.chapters.includes(n))) current.chapters.push(n);
    }
  }
  return phases.filter((p) => p.chapters.length);
}

/**
 * Chapter-level prerequisites from Mermaid. A node maps to a chapter when its
 * label names exactly one chapter, or it sits in a subgraph that names exactly
 * one chapter. Dashed edges (-.->) are annotations, not prerequisites.
 */
function readPrerequisites(mermaid: string, known: Set<string>): { map: Map<string, string[]> } {
  const nodeChapter = new Map<string, string>();
  let subgraphChapter: string | null = null;
  const nodeDef = /([A-Za-z][\w]*)\s*(?:\[\s*"?([^\]"]*)"?\s*\]|\(\s*"?([^)"]*)"?\s*\))/g;
  for (const raw of mermaid.split("\n")) {
    const line = raw.trim();
    const sub = line.match(/^subgraph\s+\w+\s*\[\s*"?([^\]"]*)"?\s*\]/);
    if (sub) {
      const nums = chapterNumbers(sub[1], known);
      subgraphChapter = nums.length === 1 ? nums[0] : null;
      continue;
    }
    if (line === "end") {
      subgraphChapter = null;
      continue;
    }
    for (const m of line.matchAll(nodeDef)) {
      const nums = chapterNumbers(m[2] ?? m[3] ?? "", known);
      const chapter = nums.length === 1 ? nums[0] : subgraphChapter;
      if (chapter && !nodeChapter.has(m[1])) nodeChapter.set(m[1], chapter);
    }
  }
  const map = new Map<string, string[]>();
  const edge = /([A-Za-z][\w]*)(?:\s*[\[(][^\])]*[\])])?\s*-->\s*(?:\|[^|]*\|\s*)?([A-Za-z][\w]*)/g;
  for (const raw of mermaid.split("\n")) {
    if (raw.includes("-.") || raw.includes(".-")) continue;
    for (const m of raw.matchAll(edge)) {
      const from = nodeChapter.get(m[1]);
      const to = nodeChapter.get(m[2]);
      if (!from || !to || from === to) continue;
      const list = map.get(to) ?? [];
      if (!list.includes(from)) list.push(from);
      map.set(to, list.sort());
    }
  }
  return { map };
}

export function parseRoadmap(readme: string, catalog: ChapterCatalog): RoadmapModel {
  const known = new Set(catalog.chapters.map((c) => c.number));
  const phases = readPhases(readme, known);
  const placed = new Set(phases.flatMap((p) => p.chapters));
  const rest = catalog.chapters.map((c) => c.number).filter((n) => !placed.has(n));
  if (rest.length) phases.push({ title: phases.length ? "기타 챕터" : "챕터", chapters: rest });
  const mermaid = mermaidBlock(readme);
  if (!mermaid) return { phases, prerequisites: new Map(), dependencySource: "none" };
  const { map } = readPrerequisites(mermaid, known);
  // Only claim chapter dependencies when at least one chapter-to-chapter edge was found.
  return { phases, prerequisites: map, dependencySource: map.size > 0 ? "chapters" : "concepts" };
}

export type RoadmapRow = { text: string; tone: "accent" | "success" | "dim" | "muted" | "text" | "warning" };

const DONE = new Set(["completed", "skipped_understood"]);

function chapterState(c: CatalogChapter): { icon: string; tone: RoadmapRow["tone"]; note: string } {
  const statuses = Object.values(c.phases);
  if (statuses.every((s) => DONE.has(s))) {
    const skipped = statuses.some((s) => s === "skipped_understood") && !Object.values(c.phases).slice(0, 4).every((s) => s === "completed");
    return skipped ? { icon: "–", tone: "dim", note: "건너뜀" } : { icon: "✓", tone: "success", note: "" };
  }
  if (c.active) return { icon: "▶", tone: "accent", note: PHASE_KO[c.next] };
  if (statuses.some((s) => s === "blocked" || s === "relearn_required")) return { icon: "!", tone: "warning", note: PHASE_KO[c.next] };
  if (statuses.some((s) => DONE.has(s) || s !== "not_started")) return { icon: "◐", tone: "text", note: PHASE_KO[c.next] };
  return { icon: "○", tone: "muted", note: "" };
}

/** Text rows for the side panel; keeps the current chapter visible when trimming. */
export function roadmapRows(model: RoadmapModel, catalog: ChapterCatalog, options: { maxRows: number }): RoadmapRow[] {
  const byNumber = new Map(catalog.chapters.map((c) => [c.number, c]));
  const done = catalog.chapters.filter((c) => Object.values(c.phases).every((s) => DONE.has(s))).length;
  const head: RoadmapRow[] = [
    { text: `${basename(catalog.projectRoot)}`, tone: "accent" },
    { text: `완료 ${done} / ${catalog.chapters.length}`, tone: "muted" },
  ];
  const body: RoadmapRow[] = [];
  let focus = -1;
  for (const phase of model.phases) {
    body.push({ text: "", tone: "text" }, { text: phase.title, tone: "text" });
    for (const n of phase.chapters) {
      const c = byNumber.get(n);
      if (!c) continue;
      const s = chapterState(c);
      if (c.active) focus = body.length;
      body.push({ text: `${s.icon} ${n} ${c.title}${s.note ? ` · ${s.note}` : ""}`, tone: s.tone });
      const pre = model.prerequisites.get(n)?.filter((p) => p !== String(Number(n) - 1).padStart(2, "0"));
      if (pre?.length) body.push({ text: `    선행: ${pre.join(", ")}`, tone: "dim" });
      else if (c.active && model.prerequisites.get(n)?.length) body.push({ text: `    선행: ${model.prerequisites.get(n)!.join(", ")}`, tone: "dim" });
    }
  }
  const legend: RoadmapRow[] = [
    { text: "", tone: "text" },
    {
      text:
        model.dependencySource === "chapters"
          ? "✓완료 ▶현재 ◐진행 ○전 –건너뜀 · 선행은 README 의존성 지도 기준"
          : "✓완료 ▶현재 ◐진행 ○전 –건너뜀 · README 지도가 개념 단위라 챕터 선행은 표시 안 함",
      tone: "dim",
    },
    { text: "/study-map 다시 입력하면 닫힘", tone: "dim" },
  ];
  const budget = Math.max(4, options.maxRows - head.length - legend.length);
  let visible = body;
  if (body.length > budget) {
    const center = focus >= 0 ? focus : body.findIndex((r) => /^[◐!○]/.test(r.text));
    const start = Math.max(0, Math.min((center < 0 ? 0 : center) - Math.floor(budget / 2), body.length - budget + 2));
    const end = Math.min(body.length, start + budget - (start > 0 ? 1 : 0) - 1);
    visible = [
      ...(start > 0 ? [{ text: `  … 위 ${start}줄`, tone: "dim" as const }] : []),
      ...body.slice(start, end),
      ...(end < body.length ? [{ text: `  … 아래 ${body.length - end}줄`, tone: "dim" as const }] : []),
    ];
  }
  return [...head, ...visible, ...legend];
}
