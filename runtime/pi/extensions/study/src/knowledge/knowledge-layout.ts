/**
 * Deterministic force layout for the knowledge graph (clean-room, no
 * external library). Rules follow LearnHarness's published behaviour:
 * links pull like springs, every node repels every other, a weak gravity
 * keeps clusters together; junction (joint-premise) points use half-length
 * links so an argument converges tightly; nodes with no relation sit on an
 * outer rim as "not yet connected knowledge"; previously placed nodes are
 * held near their last position so the picture grows instead of reshuffling.
 */
export type LayoutNode = { id: string; junction: boolean };
export type LayoutEdge = { from: string; to: string };
export type LayoutInput = { nodes: LayoutNode[]; edges: LayoutEdge[] };
export type Point = { x: number; y: number };
export type LayoutResult = { positions: Record<string, Point>; orphans: string[] };

const LINK_DISTANCE = 40;
const LINK_STRENGTH = 0.5;
const CHARGE = -240;
const GRAVITY = 0.03;
const VELOCITY_DECAY = 0.4;
const ALPHA_DECAY = 0.0228;
const ALPHA_MIN = 0.001;
const ANCHOR_PULL = 0.85;
const RIM_FACTOR = 1.7;

/** FNV-1a: stable per-id seed. */
function hash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seedAngle(id: string): number {
  return ((hash(id) % 3600) / 3600) * Math.PI * 2;
}

export function layoutGraph(input: LayoutInput, previous: Record<string, Point> = {}): LayoutResult {
  const ids = input.nodes.map((n) => n.id).sort();
  const junction = new Set(input.nodes.filter((n) => n.junction).map((n) => n.id));
  const known = new Set(ids);
  const edges = input.edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to);
  const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    neighbours.get(e.from)!.push(e.to);
    neighbours.get(e.to)!.push(e.from);
  }
  const orphans = ids.filter((id) => !junction.has(id) && neighbours.get(id)!.length === 0);
  const orphanSet = new Set(orphans);
  const live = ids.filter((id) => !orphanSet.has(id));

  // Seeds: keep known positions; place new nodes near placed neighbours, else on a spiral.
  const pos = new Map<string, Point & { vx: number; vy: number }>();
  const anchors = new Map<string, Point>();
  for (const id of live) {
    const p = previous[id];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && !isFarRim(p, previous, live)) {
      pos.set(id, { x: p.x, y: p.y, vx: 0, vy: 0 });
      anchors.set(id, { x: p.x, y: p.y });
    }
  }
  live.forEach((id, index) => {
    if (pos.has(id)) return;
    const placed = neighbours.get(id)!.map((n) => pos.get(n)).filter((p): p is Point & { vx: number; vy: number } => !!p);
    const angle = seedAngle(id);
    if (placed.length) {
      const cx = placed.reduce((s, p) => s + p.x, 0) / placed.length;
      const cy = placed.reduce((s, p) => s + p.y, 0) / placed.length;
      pos.set(id, { x: cx + Math.cos(angle) * 20, y: cy + Math.sin(angle) * 20, vx: 0, vy: 0 });
    } else {
      const r = 10 * Math.sqrt(0.5 + index);
      pos.set(id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 });
    }
  });

  const links = edges
    .filter((e) => pos.has(e.from) && pos.has(e.to))
    .map((e) => ({
      a: pos.get(e.from)!,
      b: pos.get(e.to)!,
      length: junction.has(e.from) || junction.has(e.to) ? LINK_DISTANCE / 2 : LINK_DISTANCE,
    }));
  const degree = new Map(live.map((id) => [id, Math.max(1, neighbours.get(id)!.length)]));
  const linkBias = edges
    .filter((e) => pos.has(e.from) && pos.has(e.to))
    .map((e) => degree.get(e.from)! / (degree.get(e.from)! + degree.get(e.to)!));
  const bodies = live.map((id) => pos.get(id)!);

  let alpha = anchors.size >= live.length && live.length > 0 ? 0.3 : 1;
  while (alpha > ALPHA_MIN) {
    links.forEach((link, i) => {
      let dx = link.b.x + link.b.vx - link.a.x - link.a.vx;
      let dy = link.b.y + link.b.vy - link.a.y - link.a.vy;
      const d = Math.hypot(dx, dy) || 1e-6;
      const f = ((d - link.length) / d) * alpha * LINK_STRENGTH;
      dx *= f;
      dy *= f;
      const bias = linkBias[i];
      link.b.vx -= dx * bias;
      link.b.vy -= dy * bias;
      link.a.vx += dx * (1 - bias);
      link.a.vy += dy * (1 - bias);
    });
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          dx = 1e-3 * (j - i);
          dy = 1e-3;
          d2 = dx * dx + dy * dy;
        }
        const w = (CHARGE * alpha) / d2;
        a.vx += dx * w;
        a.vy += dy * w;
        b.vx -= dx * w;
        b.vy -= dy * w;
      }
      a.vx -= a.x * GRAVITY * alpha;
      a.vy -= a.y * GRAVITY * alpha;
    }
    for (const id of live) {
      const p = pos.get(id)!;
      p.vx *= 1 - VELOCITY_DECAY;
      p.vy *= 1 - VELOCITY_DECAY;
      p.x += p.vx;
      p.y += p.vy;
      const anchor = anchors.get(id);
      if (anchor) {
        p.x += (anchor.x - p.x) * ANCHOR_PULL;
        p.y += (anchor.y - p.y) * ANCHOR_PULL;
      }
    }
    alpha += (0 - alpha) * ALPHA_DECAY;
  }

  // Rim for unconnected knowledge, sized from the connected core only.
  const core = live.filter((id) => !junction.has(id)).map((id) => pos.get(id)!);
  const cx = core.length ? core.reduce((s, p) => s + p.x, 0) / core.length : 0;
  const cy = core.length ? core.reduce((s, p) => s + p.y, 0) / core.length : 0;
  const coreMax = core.length ? Math.max(...core.map((p) => Math.hypot(p.x - cx, p.y - cy))) : 0;
  const meanR = core.length ? core.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / core.length : 0;
  const rim = Math.max(coreMax + LINK_DISTANCE * 1.5, meanR * RIM_FACTOR, 120);

  const positions: Record<string, Point> = {};
  for (const id of live) positions[id] = round(pos.get(id)!);
  for (const id of orphans) {
    const p = previous[id];
    if (p && Math.hypot(p.x - cx, p.y - cy) > coreMax + LINK_DISTANCE) positions[id] = round(p);
    else {
      const angle = seedAngle(id);
      const jitter = ((hash(`${id}:r`) % 100) / 100) * LINK_DISTANCE;
      positions[id] = round({ x: cx + Math.cos(angle) * (rim + jitter), y: cy + Math.sin(angle) * (rim + jitter) });
    }
  }
  return { positions, orphans };
}

/** A node that was on the previous rim and is now connected must leave it. */
function isFarRim(p: Point, previous: Record<string, Point>, live: string[]): boolean {
  const others = live.map((id) => previous[id]).filter((q): q is Point => !!q && q !== p);
  if (others.length < 2) return false;
  const cx = others.reduce((s, q) => s + q.x, 0) / others.length;
  const cy = others.reduce((s, q) => s + q.y, 0) / others.length;
  const maxR = Math.max(...others.map((q) => Math.hypot(q.x - cx, q.y - cy)));
  return Math.hypot(p.x - cx, p.y - cy) > maxR * 1.15 + LINK_DISTANCE;
}

function round(p: Point): Point {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}
