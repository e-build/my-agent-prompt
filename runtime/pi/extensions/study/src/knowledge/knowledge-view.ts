import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { listSchedules } from "../review/review-store.ts";
import { assertDate, localDate } from "../review/review-date.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import type { ChapterBinding } from "./chapter-bindings.ts";
import { layoutGraph, type Point } from "./knowledge-layout.ts";
import { loadAllItems, loadChains } from "./knowledge-store.ts";
import type { KnowledgeStatus } from "./knowledge-types.ts";

export type ViewNode = {
  id: string;
  label: string;
  status: KnowledgeStatus;
  version: number;
  sourceCount: number;
  chapters: string[];
  review?: { dueDate: string | null; timing: "overdue" | "today" | "future" | "done"; round: number; total: number };
};
/** Joint premises converge on an invisible point; one arrow leaves it. */
export type ViewJunction = { id: string; premises: string[]; conclusion: string };
export type ViewCluster = { id: string; label: string | null; members: string[] };
export type KnowledgeView = {
  generatedAt: string;
  today: string;
  focus: string | null;
  nodes: ViewNode[];
  junctions: ViewJunction[];
  clusters: ViewCluster[];
  orphans: string[];
  positions: Record<string, Point>;
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
      try {
        result.push({ ...JSON.parse(await readFile(join(dir, name), "utf8")), projectSlug: project.slug });
      } catch {
        /* a corrupt binding is reported by the session-start workspace check, not by the graph */
      }
    }
  }
  return result;
}

/**
 * Read-only learner-safe proposition graph: names, statuses, inference
 * structure, review dates and a deterministic layout. Statements,
 * explanations, criteria and answers are deliberately absent.
 */
export async function buildKnowledgeView(
  root: string,
  options: { focus?: string; today?: string; previousPositions?: Record<string, Point> } = {},
): Promise<KnowledgeView> {
  const workspace = await readWorkspace(root);
  const today = options.today ? assertDate(options.today) : localDate(new Date(), workspace.manifest.timezone);
  const items = (await loadAllItems(root)).filter((item) => !item.mergedInto && item.status !== "retired");
  const schedules = new Map((await listSchedules(root)).map((s) => [s.knowledgeId, s]));
  const chaptersOf = new Map<string, string[]>();
  for (const binding of await bindings(root)) {
    const label = `${binding.projectSlug}/${binding.chapterSlug}`;
    for (const region of binding.regions)
      for (const ref of region.refs) {
        const list = chaptersOf.get(ref.id) ?? [];
        if (!list.includes(label)) list.push(label);
        chaptersOf.set(ref.id, list);
      }
  }
  const nodes: ViewNode[] = items.map((item) => {
    const s = schedules.get(item.id);
    return {
      id: item.id,
      label: item.name,
      status: item.status,
      version: item.version,
      sourceCount: item.sources.length,
      chapters: chaptersOf.get(item.id) ?? [],
      ...(s && s.status !== "merged"
        ? {
            review: {
              dueDate: s.dueDate,
              timing:
                s.status === "completed" || !s.dueDate ? "done" : s.dueDate < today ? "overdue" : s.dueDate === today ? "today" : "future",
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
    .map((c) => ({ id: `j-${c.id}`, premises: c.premiseRefs.map((r) => r.id).filter((id) => known.has(id)), conclusion: c.conclusionRef.id }))
    .filter((j) => j.premises.length > 0);

  const edges = junctions.flatMap((j) => [
    ...j.premises.map((p) => ({ from: p, to: j.id })),
    { from: j.id, to: j.conclusion },
  ]);
  const layout = layoutGraph(
    { nodes: [...nodes.map((n) => ({ id: n.id, junction: false })), ...junctions.map((j) => ({ id: j.id, junction: true }))], edges },
    options.previousPositions,
  );
  return {
    generatedAt: new Date().toISOString(),
    today,
    focus: options.focus && known.has(options.focus) ? options.focus : null,
    nodes,
    junctions,
    clusters: connectedClusters(nodes, junctions),
    orphans: layout.orphans,
    positions: layout.positions,
  };
}

/** Connected components over inference links, named by the chapter most members share. */
function connectedClusters(nodes: ViewNode[], junctions: ViewJunction[]): ViewCluster[] {
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(id, r);
    return r;
  };
  for (const j of junctions)
    for (const p of j.premises) {
      const a = find(p);
      const b = find(j.conclusion);
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
    }
  const groups = new Map<string, string[]>();
  for (const n of nodes) groups.set(find(n.id), [...(groups.get(find(n.id)) ?? []), n.id]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return [...groups.values()]
    .filter((members) => members.length > 1)
    .map((members) => {
      const counts = new Map<string, number>();
      for (const id of members) for (const c of byId.get(id)!.chapters) counts.set(c, (counts.get(c) ?? 0) + 1);
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return { id: `cl-${members.sort()[0]}`, label: best ? best[0] : null, members: members.sort() };
    })
    .sort((a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Embedded as JSON; `<` is escaped so data can never close the script element. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/**
 * Client renderer (one canvas, one animation loop): clusters glow behind,
 * inference lines, small disc nodes with zoom-scaled labels that fade out
 * when zoomed far, hover glow, search, click card, pan/zoom, focus. Static
 * text: its CSP hash never changes; all data comes from #graph-data.
 */
const GRAPH_SCRIPT = `(() => {
const data = JSON.parse(document.getElementById("graph-data").textContent);
const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
const card = document.getElementById("card");
const search = document.getElementById("search");
const PALETTE = ["#8f6bb3", "#5f8f9f", "#b39a5f", "#6f9f6f", "#a86f8f", "#6f7fb3"];
const STATUS = { confirmed: "#e9e6e1", uncertain: "#d9a441", conflicted: "#e06c6c", retired: "#777" };
const byId = new Map(data.nodes.map((n) => [n.id, n]));
const pos = data.positions;
const clusterOf = new Map();
data.clusters.forEach((c, i) => c.members.forEach((m) => clusterOf.set(m, i)));
const NODE_R = 3.2, LABEL = 9, GAP = 5;
let cam = { k: 1, x: 0, y: 0 }, hover = null, selected = null, matches = null, dirty = true;
const near = new Set();
if (data.focus) {
  near.add(data.focus);
  for (const j of data.junctions) {
    const members = [...j.premises, j.conclusion];
    if (members.includes(data.focus)) members.forEach((m) => near.add(m));
  }
}
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dirty = true;
}
function fit(ids) {
  const pts = ids.map((id) => pos[id]).filter(Boolean);
  if (!pts.length) { cam = { k: 1, x: innerWidth / 2, y: innerHeight / 2 }; return; }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const w = Math.max(160, Math.max(...xs) - Math.min(...xs)), h = Math.max(160, Math.max(...ys) - Math.min(...ys));
  const k = Math.min(ids.length < 4 ? 1.8 : 3, 0.8 * Math.min(innerWidth / w, (innerHeight - 80) / h));
  cam = { k, x: innerWidth / 2 - k * (Math.min(...xs) + w / 2), y: innerHeight / 2 + 20 - k * (Math.min(...ys) + h / 2) };
}
const screen = (p) => ({ x: p.x * cam.k + cam.x, y: p.y * cam.k + cam.y });
function alphaFor(id) {
  if (matches) return matches.has(id) ? 1 : 0.15;
  if (data.focus) return near.has(id) ? 1 : 0.25;
  return 1;
}
function draw() {
  dirty = false;
  ctx.fillStyle = "#141416"; ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.save(); ctx.translate(cam.x, cam.y); ctx.scale(cam.k, cam.k);
  data.clusters.forEach((c, i) => {
    const pts = c.members.map((m) => pos[m]).filter(Boolean);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const r = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 70;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, PALETTE[i % PALETTE.length] + "40"); g.addColorStop(1, PALETTE[i % PALETTE.length] + "00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.lineWidth = 0.9 / cam.k; ctx.lineCap = "round";
  for (const j of data.junctions) {
    const jp = j.premises.length === 1 ? pos[j.premises[0]] : pos[j.id];
    const to = pos[j.conclusion];
    if (!jp || !to) continue;
    const a = Math.min(alphaFor(j.conclusion), ...j.premises.map(alphaFor));
    ctx.strokeStyle = "rgba(200,200,205," + 0.55 * a + ")"; ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    if (j.premises.length > 1) for (const p of j.premises) { const q = pos[p]; if (q) { ctx.moveTo(q.x, q.y); ctx.lineTo(jp.x, jp.y); } }
    const dx = to.x - jp.x, dy = to.y - jp.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const tip = { x: to.x - ux * (NODE_R + 1), y: to.y - uy * (NODE_R + 1) };
    ctx.moveTo(jp.x, jp.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    const L = 5;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - ux * L - uy * L * 0.45, tip.y - uy * L + ux * L * 0.45);
    ctx.lineTo(tip.x - ux * L + uy * L * 0.45, tip.y - uy * L - ux * L * 0.45); ctx.fill();
  }
  const labelAlpha = Math.max(0, Math.min(1, (cam.k - 0.45) / 0.35));
  for (const n of data.nodes) {
    const p = pos[n.id]; if (!p) continue;
    const a = alphaFor(n.id);
    ctx.globalAlpha = a;
    ctx.fillStyle = STATUS[n.status] || STATUS.confirmed;
    ctx.beginPath(); ctx.arc(p.x, p.y, NODE_R, 0, Math.PI * 2); ctx.fill();
    if (n.review && (n.review.timing === "overdue" || n.review.timing === "today")) {
      ctx.strokeStyle = "#e0a96d"; ctx.lineWidth = 1.2 / cam.k; ctx.beginPath(); ctx.arc(p.x, p.y, NODE_R + 2.2, 0, Math.PI * 2); ctx.stroke();
    }
    if (labelAlpha > 0.01 || hover === n.id) {
      ctx.globalAlpha = a * (hover === n.id ? 1 : labelAlpha) * 0.85;
      ctx.font = "500 " + LABEL + "px -apple-system, system-ui, sans-serif";
      ctx.fillStyle = "#cfcfd4"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label, p.x, p.y + NODE_R + GAP);
    }
  }
  ctx.globalAlpha = 1;
  if (hover && pos[hover]) {
    const p = pos[hover];
    const g = ctx.createRadialGradient(p.x, p.y, NODE_R, p.x, p.y, NODE_R * 5);
    g.addColorStop(0, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, NODE_R * 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  const regionAlpha = Math.max(0, Math.min(1, (1.1 - cam.k) / 0.5));
  if (regionAlpha > 0.01) {
    ctx.globalAlpha = regionAlpha; ctx.fillStyle = "#d8d4ce"; ctx.textAlign = "center"; ctx.font = "600 13px -apple-system, system-ui, sans-serif";
    data.clusters.forEach((c) => {
      if (!c.label) return;
      const pts = c.members.map((m) => pos[m]).filter(Boolean);
      const s = screen({ x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: Math.min(...pts.map((p) => p.y)) });
      ctx.fillText(c.label, s.x, s.y - 18);
    });
    ctx.globalAlpha = 1;
  }
}
function loop() { if (dirty) draw(); requestAnimationFrame(loop); }
function pick(mx, my) {
  let best = null, bestD = 10;
  for (const n of data.nodes) { const p = pos[n.id]; if (!p) continue; const s = screen(p); const d = Math.hypot(s.x - mx, s.y - my); if (d < bestD) { best = n.id; bestD = d; } }
  return best;
}
function text(el, value) { el.textContent = value; return el; }
function showCard(id, mx, my) {
  selected = id; card.replaceChildren();
  if (!id) { card.hidden = true; return; }
  const n = byId.get(id);
  card.append(text(document.createElement("h3"), n.label));
  const rows = [["상태", n.status + " · v" + n.version], ["출처", n.sourceCount + "개"], ["챕터", n.chapters.join(", ") || "연결 없음"]];
  if (n.review) rows.push(["복습", n.review.timing === "done" ? "주기 완료" : n.review.dueDate + " (" + n.review.round + "/" + n.review.total + ")"]);
  if (data.orphans.includes(id)) rows.push(["관계", "아직 다른 지식과 연결 안 됨"]);
  for (const [k, v] of rows) { const p = document.createElement("p"); p.append(text(document.createElement("b"), k + " "), document.createTextNode(v)); card.append(p); }
  card.style.left = Math.min(mx + 14, innerWidth - 280) + "px"; card.style.top = Math.min(my + 14, innerHeight - 160) + "px"; card.hidden = false;
}
let drag = null;
canvas.addEventListener("mousedown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; });
addEventListener("mouseup", (e) => { if (drag && !drag.moved) showCard(pick(e.clientX, e.clientY), e.clientX, e.clientY); drag = null; });
addEventListener("mousemove", (e) => {
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; card.hidden = true; } cam.x = drag.cx + dx; cam.y = drag.cy + dy; dirty = true; return; }
  const h = pick(e.clientX, e.clientY); if (h !== hover) { hover = h; canvas.style.cursor = h ? "pointer" : "grab"; dirty = true; }
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015), k = Math.max(0.2, Math.min(8, cam.k * f));
  cam.x = e.clientX - (e.clientX - cam.x) * (k / cam.k); cam.y = e.clientY - (e.clientY - cam.y) * (k / cam.k); cam.k = k; card.hidden = true; dirty = true;
}, { passive: false });
search.addEventListener("input", () => {
  const q = search.value.trim().toLowerCase();
  matches = q ? new Set(data.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)) : null; dirty = true;
});
search.addEventListener("keydown", (e) => { if (e.key === "Enter" && matches && matches.size) { fit([...matches]); dirty = true; } if (e.key === "Escape") { search.value = ""; matches = null; dirty = true; } });
document.getElementById("toggle-table").addEventListener("click", () => { const t = document.getElementById("table-view"); t.hidden = !t.hidden; });
addEventListener("resize", resize);
resize(); fit(data.focus ? [...near] : Object.keys(pos)); loop();
})();`;

/** CSP hash for the inline renderer (constant across graphs). */
export function graphScriptHash(): string {
  return `sha256-${createHash("sha256").update(GRAPH_SCRIPT).digest("base64")}`;
}

/** Self-contained page: no external requests, no write APIs. */
export function renderKnowledgeMap(view: KnowledgeView): string {
  const tableRows = view.nodes
    .map((n) => {
      const review = n.review ? (n.review.timing === "done" ? "주기 완료" : `${n.review.dueDate} (${n.review.round}/${n.review.total})`) : "-";
      const relation = view.orphans.includes(n.id) ? "연결 없음" : "추론 연결";
      return `<tr><td>${escapeHtml(n.label)}</td><td>${escapeHtml(n.status)}</td><td>v${n.version}</td><td>${n.sourceCount}</td><td>${escapeHtml(n.chapters.join(", ") || "-")}</td><td>${escapeHtml(review)}</td><td>${relation}</td></tr>`;
    })
    .join("");
  const empty = view.nodes.length
    ? ""
    : `<div class="empty"><strong>아직 등록된 공통 지식이 없습니다.</strong><br>개념 학습에서 교재 내용을 공통 지식으로 반영하면 여기에 명제와 추론 관계가 쌓입니다.<br>프로젝트의 챕터 흐름은 터미널에서 <code>/study-map</code>으로 보세요.</div>`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>지식 그래프</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#141416;color:#e6e4e0;font-family:-apple-system,system-ui,sans-serif}
#graph{display:block;cursor:grab}
.bar{position:fixed;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center}
.bar input,.bar button{background:#1d1d20;border:1px solid #3a3a3f;color:#e6e4e0;border-radius:999px;padding:8px 16px;font:13px ui-monospace,monospace}
.bar input{width:280px}
.meta{position:fixed;top:18px;right:20px;font:12px ui-monospace,monospace;color:#8b8b90}
.legend{position:fixed;bottom:14px;left:20px;font:12px -apple-system,system-ui,sans-serif;color:#8b8b90}
#card{position:fixed;width:250px;background:#1d1d20ee;border:1px solid #3a3a3f;border-radius:10px;padding:10px 14px;font-size:12px;box-shadow:0 8px 24px #0008}
#card h3{margin:0 0 6px;font-size:14px}#card p{margin:3px 0;color:#c9c7c3}#card b{color:#8b8b90;font-weight:500}
#table-view{position:fixed;inset:64px 40px 40px;overflow:auto;background:#1a1a1d;border:1px solid #3a3a3f;border-radius:10px;padding:12px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2c2c30;padding:6px 8px;font-size:12px;text-align:left}
.empty{position:fixed;top:45%;left:50%;transform:translate(-50%,-50%);text-align:center;line-height:1.7;color:#b8b6b2}
</style></head><body>
<h1 hidden>지식 그래프</h1>
<canvas id="graph" role="img" aria-label="지식 그래프"></canvas>
<div class="bar"><input id="search" placeholder="지식 검색… (Enter: 이동, Esc: 해제)" autocomplete="off"><button id="toggle-table" type="button">표 보기</button></div>
<div class="meta">기준일 ${escapeHtml(view.today)} · 지식 ${view.nodes.length} · 추론 ${view.junctions.length} · 연결 없음 ${view.orphans.length}</div>
<div class="legend">● 확정 <span style="color:#d9a441">●</span> 미확정 <span style="color:#e06c6c">●</span> 충돌 · <span style="color:#e0a96d">○</span> 오늘 복습 · 전제 선이 모이는 점 → 결론 · 바깥 테두리 = 아직 연결 안 된 지식 · 읽기 전용</div>
${empty}
<div id="card" hidden></div>
<div id="table-view" hidden><table><thead><tr><th>지식</th><th>상태</th><th>버전</th><th>출처</th><th>챕터</th><th>복습</th><th>관계</th></tr></thead><tbody>${tableRows}</tbody></table></div>
<script id="graph-data" type="application/json">${jsonForScript(view)}</script>
<script>${GRAPH_SCRIPT}</script>
</body></html>
`;
}
