/**
 * Knowledge regions derived only from how propositions are linked — never
 * from chapters or source files. Deterministic Louvain-style modularity
 * optimisation (local moving + aggregation), clean-room implementation.
 * Labels are stored as append-only records with the member "core" they were
 * coined for; a community keeps a label while ≥ half its members come from
 * that core (LearnHarness core-survival rule), with one successor per record.
 */
export type Community = string[];
export type LabelRecord = { id: string; label: string; core: string[]; at: string };
export type LabelledCommunity = { members: string[]; label: string | null; labelId: string | null };

type Graph = { n: number; adj: Array<Map<number, number>>; selfLoop: number[]; degree: number[]; total: number };

function buildGraph(n: number, weighted: Array<[number, number, number]>): Graph {
  const adj = Array.from({ length: n }, () => new Map<number, number>());
  const selfLoop = new Array(n).fill(0);
  for (const [a, b, w] of weighted) {
    if (a === b) selfLoop[a] += w;
    else {
      adj[a].set(b, (adj[a].get(b) ?? 0) + w);
      adj[b].set(a, (adj[b].get(a) ?? 0) + w);
    }
  }
  const degree = adj.map((m, i) => [...m.values()].reduce((s, w) => s + w, 0) + 2 * selfLoop[i]);
  const total = degree.reduce((s, d) => s + d, 0) / 2;
  return { n, adj, selfLoop, degree, total };
}

/** One level of greedy local moving; returns community index per node. */
function localMoving(g: Graph): number[] {
  const community = Array.from({ length: g.n }, (_, i) => i);
  const tot = [...g.degree];
  if (g.total === 0) return community;
  const m2 = 2 * g.total;
  let moved = true;
  for (let round = 0; moved && round < 100; round++) {
    moved = false;
    for (let i = 0; i < g.n; i++) {
      const current = community[i];
      const ki = g.degree[i];
      const links = new Map<number, number>();
      for (const [j, w] of g.adj[i]) links.set(community[j], (links.get(community[j]) ?? 0) + w);
      tot[current] -= ki;
      let best = current;
      let bestGain = (links.get(current) ?? 0) - (tot[current] * ki) / m2;
      for (const c of [...links.keys()].sort((x, y) => x - y)) {
        const gain = links.get(c)! - (tot[c] * ki) / m2;
        if (gain > bestGain + 1e-12) {
          best = c;
          bestGain = gain;
        }
      }
      tot[best] += ki;
      if (best !== current) {
        community[i] = best;
        moved = true;
      }
    }
  }
  return community;
}

/**
 * Communities of nodes that link to each other more than to the rest.
 * Members and communities are sorted, so equal inputs give equal outputs.
 */
export function detectCommunities(
  nodeIds: string[],
  edges: Array<[string, string]>,
  options: { minSize?: number; weights?: Map<string, number> } = {},
): Community[] {
  const ids = [...new Set(nodeIds)].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const weighted: Array<[number, number, number]> = [];
  const seen = new Map<string, number>();
  for (const [a, b] of edges) {
    if (!index.has(a) || !index.has(b) || a === b) continue;
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    seen.set(key, (seen.get(key) ?? 0) + (options.weights?.get(key) ?? 1));
  }
  for (const key of [...seen.keys()].sort()) {
    const [a, b] = key.split("\u0000");
    weighted.push([index.get(a)!, index.get(b)!, seen.get(key)!]);
  }
  // membership[i] = community of original node i, refined level by level.
  let membership = ids.map((_, i) => i);
  let graph = buildGraph(ids.length, weighted);
  for (let level = 0; level < 20; level++) {
    const local = localMoving(graph);
    const renumber = new Map<number, number>();
    for (const c of local) if (!renumber.has(c)) renumber.set(c, renumber.size);
    if (renumber.size === graph.n) break;
    membership = membership.map((c) => renumber.get(local[c])!);
    const next: Array<[number, number, number]> = [];
    for (let i = 0; i < graph.n; i++) {
      const ci = renumber.get(local[i])!;
      if (graph.selfLoop[i]) next.push([ci, ci, graph.selfLoop[i]]);
      for (const [j, w] of graph.adj[i]) if (i < j) next.push([ci, renumber.get(local[j])!, w]);
    }
    graph = buildGraph(renumber.size, next);
  }
  const groups = new Map<number, string[]>();
  ids.forEach((id, i) => groups.set(membership[i], [...(groups.get(membership[i]) ?? []), id]));
  const linked = new Set(edges.flat());
  return [...groups.values()]
    .map((members) => members.sort())
    .filter((members) => members.length >= (options.minSize ?? 3) && members.some((m) => linked.has(m)))
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/** Attach stored labels using the core-survival rule (newest record per core first). */
export function assignLabels(communities: Community[], records: LabelRecord[]): LabelledCommunity[] {
  const candidates: Array<{ community: number; record: number; overlap: number }> = [];
  communities.forEach((members, ci) => {
    const set = new Set(members);
    records.forEach((record, ri) => {
      const overlap = record.core.filter((m) => set.has(m)).length;
      if (overlap > 0 && overlap * 2 >= members.length) candidates.push({ community: ci, record: ri, overlap });
    });
  });
  // Strongest overlap first; among equals the newest record wins.
  candidates.sort((a, b) => b.overlap - a.overlap || b.record - a.record || a.community - b.community);
  const takenCommunity = new Set<number>();
  const takenCore = new Set<string>();
  const result: LabelledCommunity[] = communities.map((members) => ({ members, label: null, labelId: null }));
  for (const c of candidates) {
    const record = records[c.record];
    const coreKey = [...record.core].sort().join("|");
    if (takenCommunity.has(c.community) || takenCore.has(coreKey)) continue;
    // Skip an older record whose core has a newer record.
    if (records.some((r, i) => i > c.record && [...r.core].sort().join("|") === coreKey)) continue;
    takenCommunity.add(c.community);
    takenCore.add(coreKey);
    result[c.community] = { members: communities[c.community], label: record.label, labelId: record.id };
  }
  return result;
}
