import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { listSchedules } from "../review/review-store.ts";
import { assertDate, localDate } from "../review/review-date.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import type { ChapterBinding } from "./chapter-bindings.ts";
import { loadAllItems, loadChains } from "./knowledge-store.ts";
import type { KnowledgeStatus } from "./knowledge-types.ts";

export type ViewNode = {
  id: string;
  kind: "knowledge" | "chapter";
  label: string;
  status?: KnowledgeStatus;
  version?: number;
  sourceCount?: number;
  review?: { dueDate: string | null; timing: "overdue" | "today" | "future" | "done"; round: number; total: number };
  distance?: number;
};
export type ViewEdge = { from: string; to: string; kind: "prerequisite" | "context" };
export type ViewJunction = { id: string; premises: string[]; conclusion: string };
export type KnowledgeView = {
  generatedAt: string;
  today: string;
  nodes: ViewNode[];
  edges: ViewEdge[];
  junctions: ViewJunction[];
};

async function bindings(root: string): Promise<Array<ChapterBinding & { projectSlug: string }>> {
  const workspace = await readWorkspace(root);
  const result: Array<ChapterBinding & { projectSlug: string }> = [];
  for (const project of workspace.manifest.projects) {
    const dir = join(root, ...project.path.split("/"), ".study", "bindings");
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
      const { readFile } = await import("node:fs/promises");
      try {
        result.push({ ...JSON.parse(await readFile(join(dir, name), "utf8")), projectSlug: project.slug });
      } catch {
        /* a corrupt binding is reported by /study-workspace check, not by the map */
      }
    }
  }
  return result;
}

/**
 * Read-only learner-safe graph: names, statuses, relation kinds, review dates.
 * Statements, explanations, criteria and answers are deliberately absent.
 */
export async function buildKnowledgeView(
  root: string,
  options: { focus?: string; depth?: number; today?: string } = {},
): Promise<KnowledgeView> {
  const workspace = await readWorkspace(root);
  const today = options.today ? assertDate(options.today) : localDate(new Date(), workspace.manifest.timezone);
  const items = (await loadAllItems(root)).filter((item) => !item.mergedInto);
  const schedules = new Map((await listSchedules(root)).map((s) => [s.knowledgeId, s]));
  const nodes: ViewNode[] = items.map((item) => {
    const s = schedules.get(item.id);
    return {
      id: item.id,
      kind: "knowledge",
      label: item.name,
      status: item.status,
      version: item.version,
      sourceCount: item.sources.length,
      ...(s && s.status !== "merged"
        ? {
            review: {
              dueDate: s.dueDate,
              timing: s.status === "completed" || !s.dueDate ? "done" : s.dueDate < today ? "overdue" : s.dueDate === today ? "today" : "future",
              round: Math.min(s.nextStage + 1, s.intervals.length),
              total: s.intervals.length,
            },
          }
        : {}),
    } as ViewNode;
  });
  const known = new Set(nodes.map((n) => n.id));
  const junctions: ViewJunction[] = (await loadChains(root))
    .filter((c) => !c.retired && known.has(c.conclusionRef.id))
    .map((c) => ({ id: c.id, premises: c.premiseRefs.map((r) => r.id).filter((id) => known.has(id)), conclusion: c.conclusionRef.id }));
  const edges: ViewEdge[] = [];
  for (const binding of await bindings(root)) {
    const chapterId = `chapter:${binding.projectSlug}/${binding.chapterSlug}`;
    nodes.push({ id: chapterId, kind: "chapter", label: `${binding.projectSlug}/${binding.chapterSlug}` });
    for (const region of binding.regions)
      for (const ref of region.refs) if (known.has(ref.id)) edges.push({ from: ref.id, to: chapterId, kind: "context" });
    for (const p of binding.prerequisites) if (known.has(p.refId)) edges.push({ from: p.refId, to: chapterId, kind: "prerequisite" });
  }
  let view: KnowledgeView = { generatedAt: new Date().toISOString(), today, nodes, edges, junctions };
  if (options.focus) view = neighbourhood(view, options.focus, options.depth ?? 2);
  return view;
}

function neighbourhood(view: KnowledgeView, focus: string, depth: number): KnowledgeView {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    adjacency.set(a, (adjacency.get(a) ?? new Set()).add(b));
    adjacency.set(b, (adjacency.get(b) ?? new Set()).add(a));
  };
  view.edges.forEach((e) => link(e.from, e.to));
  view.junctions.forEach((j) => j.premises.forEach((p) => link(p, j.conclusion)));
  const distance = new Map<string, number>([[focus, 0]]);
  const queue = [focus];
  while (queue.length) {
    const current = queue.shift()!;
    const d = distance.get(current)!;
    if (d >= depth) continue;
    for (const next of adjacency.get(current) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, d + 1);
      queue.push(next);
    }
  }
  const keep = (id: string) => distance.has(id);
  return {
    ...view,
    nodes: view.nodes.filter((n) => keep(n.id)).map((n) => ({ ...n, distance: distance.get(n.id) })),
    edges: view.edges.filter((e) => keep(e.from) && keep(e.to)),
    junctions: view.junctions.filter((j) => keep(j.conclusion) && j.premises.some(keep)),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Static, script-free HTML with an SVG layout and a table fallback. */
export function renderKnowledgeMap(view: KnowledgeView): string {
  const knowledge = view.nodes.filter((n) => n.kind === "knowledge");
  const chapters = view.nodes.filter((n) => n.kind === "chapter");
  const W = 220;
  const H = 56;
  const gap = 28;
  const pos = new Map<string, { x: number; y: number }>();
  knowledge.forEach((n, i) => pos.set(n.id, { x: 40 + (i % 3) * (W + 80), y: 40 + Math.floor(i / 3) * (H + gap + 40) }));
  const rows = Math.max(1, Math.ceil(knowledge.length / 3));
  const chapterY = 40 + rows * (H + gap + 40) + 30;
  chapters.forEach((n, i) => pos.set(n.id, { x: 40 + i * (W + 40), y: chapterY }));
  const width = Math.max(800, 40 + Math.max(3, chapters.length) * (W + 80));
  const height = chapterY + H + 40;
  const center = (id: string) => {
    const p = pos.get(id)!;
    return { x: p.x + W / 2, y: p.y + H / 2 };
  };
  const statusColor: Record<string, string> = { confirmed: "#2f6f4f", uncertain: "#9a6b00", conflicted: "#a33", retired: "#777" };
  const lines: string[] = [];
  for (const e of view.edges) {
    if (!pos.has(e.from) || !pos.has(e.to)) continue;
    const a = center(e.from);
    const b = center(e.to);
    lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="edge ${e.kind}"/>`);
  }
  for (const j of view.junctions) {
    if (!pos.has(j.conclusion)) continue;
    const premises = j.premises.filter((p) => pos.has(p));
    if (!premises.length) continue;
    const c = center(j.conclusion);
    const mx = premises.reduce((s, p) => s + center(p).x, c.x) / (premises.length + 1);
    const my = premises.reduce((s, p) => s + center(p).y, c.y) / (premises.length + 1);
    for (const p of premises) {
      const a = center(p);
      lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${mx}" y2="${my}" class="edge inference"/>`);
    }
    lines.push(`<line x1="${mx}" y1="${my}" x2="${c.x}" y2="${c.y}" class="edge inference" marker-end="url(#arrow)"/>`);
    lines.push(`<circle cx="${mx}" cy="${my}" r="6" class="junction"><title>공동 전제 ${premises.length}개 → 결론</title></circle>`);
  }
  const boxes = view.nodes
    .filter((n) => pos.has(n.id))
    .map((n) => {
      const p = pos.get(n.id)!;
      const color = n.kind === "chapter" ? "#345" : statusColor[n.status ?? "confirmed"];
      const sub = n.kind === "chapter" ? "챕터" : `${n.status} · v${n.version}${n.review ? ` · 복습 ${n.review.timing === "done" ? "완료" : `${n.review.dueDate}`}` : ""}`;
      return `<g><rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="8" stroke="${color}" class="${n.kind}"/><text x="${p.x + 10}" y="${p.y + 22}" class="label">${escapeHtml(n.label.slice(0, 28))}</text><text x="${p.x + 10}" y="${p.y + 42}" class="sub">${escapeHtml(sub)}</text><title>${escapeHtml(n.label)}</title></g>`;
    });
  const tableRows = knowledge
    .map(
      (n) =>
        `<tr><td>${escapeHtml(n.label)}</td><td>${escapeHtml(n.status ?? "")}</td><td>v${n.version}</td><td>${n.sourceCount}</td><td>${n.review ? escapeHtml(n.review.timing === "done" ? "주기 완료" : `${n.review.dueDate} (${n.review.round}/${n.review.total})`) : "-"}</td><td>${escapeHtml(view.edges.filter((e) => e.from === n.id).map((e) => `${e.kind === "context" ? "적용" : "선수"}: ${e.to.replace("chapter:", "")}`).join(", "))}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>지식 지도</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:24px;color:#1d1d1f;background:#fafaf7}
h1{font-size:20px} .legend span{margin-right:16px;font-size:13px}
svg{background:#fff;border:1px solid #ddd;border-radius:8px;max-width:100%;height:auto}
rect{fill:#fff;stroke-width:2} rect.chapter{fill:#eef2f6}
.label{font-size:13px;font-weight:600} .sub{font-size:11px;fill:#555}
.edge{stroke:#999;stroke-width:1.5} .edge.prerequisite{stroke-dasharray:6 4;stroke:#7a5} .edge.context{stroke:#89a} .edge.inference{stroke:#333}
.junction{fill:#333} table{border-collapse:collapse;margin-top:16px;background:#fff;width:100%}
td,th{border:1px solid #ddd;padding:6px 8px;font-size:13px;text-align:left}
</style></head><body>
<h1>지식 지도</h1>
<p>읽기 전용. 기준일 ${escapeHtml(view.today)} · 지식 ${knowledge.length}개 · 추론 ${view.junctions.length}개. 내용·정답은 표시하지 않습니다. 수정은 Pi 대화로 요청하세요.</p>
<p class="legend"><span>━ 추론(●=공동 전제)</span><span>┅ 선수 학습</span><span>─ 적용 챕터</span></p>
<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="지식 지도">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#333"/></marker></defs>
${lines.join("\n")}
${boxes.join("\n")}
</svg>
<h2>표 보기</h2>
<table><thead><tr><th>지식</th><th>상태</th><th>버전</th><th>출처 수</th><th>복습</th><th>관계</th></tr></thead><tbody>${tableRows}</tbody></table>
</body></html>
`;
}
