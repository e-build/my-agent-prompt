import { randomUUID } from "node:crypto";
import { rmdir } from "node:fs/promises";
import { posix } from "node:path";
import { readTextOptional, sha256 } from "../workspace/atomic-file.ts";
import { executePlan, preparePlan, type PlannedChange } from "../workspace/change-plan.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import { loadItem } from "../knowledge/knowledge-store.ts";
import { assertBodySafe, DEFAULT_NOTES, parsePage, renderPage, type ParsedPage, type RegionId } from "./book-page.ts";
import { refreshDashboard } from "./book-dashboard.ts";
import { renderFoot, renderHead } from "./book-render.ts";
import {
  abs,
  conceptChangePath,
  conceptHistoryPath,
  conceptPath,
  CONCEPTS_DIR,
  encodeConcept,
  loadConcepts,
} from "./book-store.ts";
import { activeById, assertTree, pagePaths } from "./book-tree.ts";
import {
  normalizeConceptName,
  validateConceptId,
  validateLearnedIn,
  type ConceptNode,
  type ConceptOwner,
  type LearnedIn,
  type SourceMaterial,
  validateSource,
} from "./book-types.ts";

export type Actor = ConceptOwner;
/** Existing node id, or `key:<key>` for a node created earlier in the same batch. */
type NodeRef = string;
type Expect = { expectedRevisionId?: string };

export type BookOperation =
  | { op: "create"; key?: string; name: string; parentId: NodeRef | null; order?: number; aliases?: string[] }
  | ({ op: "rename"; id: NodeRef; name: string; aliases?: string[] } & Expect)
  | ({ op: "move"; id: NodeRef; parentId: NodeRef | null; order?: number } & Expect)
  | ({ op: "retire"; id: NodeRef; into?: NodeRef } & Expect)
  | ({ op: "place"; id: NodeRef; knowledgeIds: string[] } & Expect)
  | ({ op: "unplace"; id: NodeRef; knowledgeIds: string[] } & Expect)
  | ({ op: "move_member"; from: NodeRef; to: NodeRef; knowledgeIds: string[] } & { expectedRevisionIds?: Record<string, string> })
  | { op: "relate" | "unrelate"; id: NodeRef; otherId: NodeRef; expectedRevisionIds?: Record<string, string> }
  | ({ op: "write_page"; id: NodeRef; body: string } & Expect)
  | ({ op: "adopt_page"; id: NodeRef } & Expect)
  | ({ op: "record_learned"; id: NodeRef; learnedIn: LearnedIn } & Expect)
  | ({ op: "record_source"; id: NodeRef; source: SourceMaterial } & Expect)
  | { op: "propose"; id: NodeRef; message: string };

export type BookChangeRequest =
  | { changeId: string; reason: string; operations: BookOperation[] }
  | { changeId: string; reason: string; undo: string };

export type PageResult = { conceptId: string; path: string; action: "created" | "updated" | "moved" | "removed" | "kept_edited"; from?: string };

type FileRecord = { path: string; before: string | null; after: string | null };
export type BookChangeRecord = {
  changeId: string;
  reason: string;
  actor: Actor;
  at: string;
  payloadSha256: string;
  undoOf?: string;
  files: FileRecord[];
  pages: PageResult[];
  summary: string;
};

export type BookChangeResult = {
  status: "committed" | "already_applied";
  changeId: string;
  pages: PageResult[];
  nodes: ConceptNode[];
  summary: string;
  /** The dashboard is derived; failing to refresh it never fails the change. */
  dashboardWarning?: string;
};

export type BookApplyOptions = { now?: () => string };

const CHANGE_ID = /^[A-Za-z0-9_.-]{1,80}$/;
const KEY = /^[a-z0-9-]{1,32}$/;
export const PROPOSALS_FILE = `${CONCEPTS_DIR}/proposals.jsonl`;
const EMPTY_MAIN = "(아직 본문이 없습니다)";

function newRevision(): string {
  return `rev-${randomUUID()}`;
}

/** Mutable working copy of the tree for one batch. */
class Batch {
  readonly nodes = new Map<string, ConceptNode>();
  readonly keys = new Map<string, string>();
  readonly touched = new Set<string>();
  readonly created = new Set<string>();
  readonly writes = new Map<string, string>();
  readonly adopts = new Set<string>();
  readonly proposals: string[] = [];

  readonly actor: Actor;
  readonly at: string;

  constructor(actor: Actor, at: string, initial: ConceptNode[]) {
    this.actor = actor;
    this.at = at;
    for (const node of initial) this.nodes.set(node.id, structuredClone(node));
  }

  resolve(ref: NodeRef): ConceptNode {
    const id = ref.startsWith("key:") ? this.keys.get(ref.slice(4)) : ref;
    if (!id) throw new Error(`같은 변경에서 만든 개념 key를 찾지 못했습니다: ${ref}`);
    const node = this.nodes.get(validateConceptId(id));
    if (!node) throw new Error(`개념을 찾지 못했습니다: ${ref}`);
    if (node.retired) throw new Error(`폐기된 개념입니다: ${node.name}`);
    return node;
  }

  /** First touch of an existing node must name the revision the caller read. */
  touch(node: ConceptNode, expected: string | undefined): ConceptNode {
    if (!this.touched.has(node.id) && !this.created.has(node.id)) {
      if (node.revisionId !== expected)
        throw new Error(`다른 변경이 먼저 저장됐습니다. 개념을 다시 조회하세요: ${node.name} (현재 ${node.revisionId}, 기대 ${expected})`);
    }
    this.touched.add(node.id);
    return node;
  }

  /** Agents may not change the name or position of user-owned nodes. */
  guardStructure(node: ConceptNode, what: string): void {
    if (this.actor === "agent" && node.owner === "user")
      throw new Error(`사용자가 정한 개념은 에이전트가 ${what}할 수 없습니다: ${node.name}. propose로 제안하세요.`);
  }

  parent(ref: NodeRef | null): string | null {
    if (ref === null) {
      if (this.actor === "agent") throw new Error("최상위 영역은 사용자만 만들 수 있습니다. 기존 영역 아래에 만들거나 propose로 제안하세요.");
      return null;
    }
    return this.resolve(ref).id;
  }
}

async function requireActiveKnowledge(root: string, id: string): Promise<void> {
  const item = await loadItem(root, id);
  if (!item) throw new Error(`지식을 찾지 못했습니다: ${id}`);
  if (item.mergedInto) throw new Error(`병합된 지식은 페이지에 넣을 수 없습니다: ${id} → ${item.mergedInto}`);
}

async function runOperation(root: string, batch: Batch, op: BookOperation): Promise<void> {
  switch (op.op) {
    case "create": {
      if (op.key !== undefined && (!KEY.test(op.key) || batch.keys.has(op.key))) throw new Error(`create key가 올바르지 않거나 중복됐습니다: ${op.key}`);
      const parentId = batch.parent(op.parentId);
      const siblings = [...batch.nodes.values()].filter((n) => !n.retired && n.parentId === parentId);
      const node: ConceptNode = {
        schemaVersion: 1,
        id: `cn-${randomUUID()}`,
        version: 1,
        revisionId: newRevision(),
        parentRevisionIds: [],
        name: normalizeConceptName(op.name),
        parentId,
        owner: batch.actor,
        order: op.order ?? Math.max(0, ...siblings.map((s) => s.order + 1)),
        aliases: op.aliases ?? [],
        members: [],
        learnedIn: [],
        related: [],
      };
      batch.nodes.set(node.id, node);
      batch.created.add(node.id);
      batch.touched.add(node.id);
      if (op.key) batch.keys.set(op.key, node.id);
      return;
    }
    case "rename": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.guardStructure(node, "이름을 바꿀");
      node.name = normalizeConceptName(op.name);
      if (op.aliases) node.aliases = op.aliases;
      if (batch.actor === "user") node.owner = "user";
      return;
    }
    case "move": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.guardStructure(node, "옮길");
      node.parentId = batch.parent(op.parentId);
      if (op.order !== undefined) node.order = op.order;
      if (batch.actor === "user") node.owner = "user";
      return;
    }
    case "retire": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.guardStructure(node, "폐기");
      if ([...batch.nodes.values()].some((n) => !n.retired && n.parentId === node.id))
        throw new Error(`하위 개념이 있는 개념은 폐기할 수 없습니다. 먼저 옮기세요: ${node.name}`);
      if (node.members.length) throw new Error(`지식이 남아 있는 개념은 폐기할 수 없습니다. move_member로 옮기세요: ${node.name}`);
      const into = op.into ? batch.resolve(op.into) : undefined;
      if (into?.id === node.id) throw new Error("자기 자신으로 합칠 수 없습니다.");
      if (into) batch.touched.add(into.id);
      node.retired = { at: batch.at, ...(into ? { into: into.id } : {}) };
      return;
    }
    case "place": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      for (const id of op.knowledgeIds) await requireActiveKnowledge(root, id);
      node.members = [...new Set([...node.members, ...op.knowledgeIds])];
      return;
    }
    case "unplace": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      node.members = node.members.filter((m) => !op.knowledgeIds.includes(m));
      return;
    }
    case "move_member": {
      const from = batch.resolve(op.from);
      const to = batch.resolve(op.to);
      batch.touch(from, op.expectedRevisionIds?.[from.id]);
      batch.touch(to, op.expectedRevisionIds?.[to.id]);
      for (const id of op.knowledgeIds)
        if (!from.members.includes(id)) throw new Error(`${from.name}에 없는 지식입니다: ${id}`);
      from.members = from.members.filter((m) => !op.knowledgeIds.includes(m));
      to.members = [...new Set([...to.members, ...op.knowledgeIds])];
      return;
    }
    case "relate":
    case "unrelate": {
      const a = batch.resolve(op.id);
      const b = batch.resolve(op.otherId);
      if (a.id === b.id) throw new Error("자기 자신과 관련 지을 수 없습니다.");
      batch.touch(a, op.expectedRevisionIds?.[a.id]);
      batch.touch(b, op.expectedRevisionIds?.[b.id]);
      for (const [x, y] of [[a, b], [b, a]])
        x.related = op.op === "relate" ? [...new Set([...x.related, y.id])] : x.related.filter((r) => r !== y.id);
      return;
    }
    case "write_page": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.writes.set(node.id, assertBodySafe(op.body));
      return;
    }
    case "adopt_page": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      batch.adopts.add(node.id);
      return;
    }
    case "record_learned": {
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      const entry = validateLearnedIn(op.learnedIn);
      if (!node.learnedIn.some((l) => l.projectId === entry.projectId && l.chapterSlug === entry.chapterSlug))
        node.learnedIn = [...node.learnedIn, entry];
      return;
    }
    case "record_source": {
      const entry = validateSource(op.source);
      const node = batch.touch(batch.resolve(op.id), op.expectedRevisionId);
      const key = (x: SourceMaterial) => x.path ?? x.url;
      if (!(node.sources ?? []).some((x) => key(x) === key(entry))) node.sources = [...(node.sources ?? []), entry];
      return;
    }
    case "propose": {
      const node = batch.resolve(op.id);
      if (typeof op.message !== "string" || !op.message.trim()) throw new Error("propose에는 message가 필요합니다.");
      batch.proposals.push(JSON.stringify({ conceptId: node.id, message: op.message.trim(), actor: batch.actor, at: batch.at }));
      return;
    }
    default:
      throw new Error(`지원하지 않는 작업입니다: ${(op as { op: string }).op}`);
  }
}

async function readPage(root: string, path: string): Promise<{ content: string; page: ParsedPage } | null> {
  const content = await readTextOptional(abs(root, path));
  return content === null ? null : { content, page: parsePage(content) };
}

/** Regenerate every active page; emit only real changes. Edited regions are never overwritten silently. */
async function planPages(root: string, batch: Batch, before: ConceptNode[]): Promise<{ files: PlannedChange[]; pages: PageResult[] }> {
  const after = [...batch.nodes.values()];
  const byId = activeById(after);
  const oldPaths = pagePaths(before);
  const newPaths = pagePaths(after);
  const projects = (await readWorkspace(root)).manifest.projects;
  const files: PlannedChange[] = [];
  const pages: PageResult[] = [];
  const carriedNotes = new Map<string, string[]>();

  for (const node of after.filter((n) => n.retired && batch.touched.has(n.id) && oldPaths.has(n.id))) {
    const path = oldPaths.get(node.id)!;
    const current = await readPage(root, path);
    const notes = current?.page.notes.trim() ?? "";
    if (current && notes && notes !== DEFAULT_NOTES.trim()) {
      if (!node.retired!.into) throw new Error(`메모가 있는 페이지는 into 없이 폐기할 수 없습니다: ${path}`);
      carriedNotes.set(node.retired!.into, [...(carriedNotes.get(node.retired!.into) ?? []), `### ${node.name}에서 옮긴 메모\n\n${notes.replace(/^## 메모\n+/, "")}`]);
    }
    if (current) {
      files.push({ path, after: null });
      pages.push({ conceptId: node.id, path, action: "removed" });
    }
  }

  const claimed = new Set<string>();
  for (const node of byId.values()) {
    const path = newPaths.get(node.id)!;
    const oldPath = oldPaths.get(node.id);
    const current = oldPath ? await readPage(root, oldPath) : null;
    if (oldPath !== path) {
      const occupant = await readPage(root, path).catch(() => ({ content: "", page: { conceptId: "?" } as ParsedPage }));
      const movingAway = [...oldPaths.entries()].some(([id, p]) => p === path && newPaths.get(id) !== path);
      if (occupant && !movingAway) throw new Error(`새 경로에 다른 파일이 있습니다: ${path}`);
    }
    if (claimed.has(path)) throw new Error(`두 개념이 같은 경로를 씁니다: ${path}`);
    claimed.add(path);

    const regions = {} as Record<RegionId, { body: string; hash?: string }>;
    let keptEdited = false;
    for (const id of ["head", "foot"] as const) {
      const generated = id === "head" ? renderHead(byId, node) : renderFoot(byId, node, projects);
      const existing = current?.page.regions[id];
      if (existing?.edited) {
        regions[id] = { body: existing.body, hash: existing.hash };
        keptEdited = keptEdited || existing.body !== generated;
      } else regions[id] = { body: generated };
    }
    const existingMain = current?.page.regions.main;
    const written = batch.writes.get(node.id);
    if (written !== undefined) {
      if (existingMain?.edited && !batch.adopts.has(node.id))
        throw new Error(`사용자가 직접 고친 본문입니다: ${path}. 덮어쓰지 않습니다. 수정본을 받아들일지(adopt_page) 사용자에게 물으세요.`);
      regions.main = { body: written };
    } else if (existingMain) {
      regions.main = batch.adopts.has(node.id) ? { body: existingMain.body } : { body: existingMain.body, hash: existingMain.hash };
    } else regions.main = { body: EMPTY_MAIN };

    const extra = carriedNotes.get(node.id);
    const baseNotes = current?.page.notes ?? DEFAULT_NOTES;
    const notes = extra ? `${baseNotes.trimEnd()}\n\n${extra.join("\n\n")}\n` : baseNotes;
    const content = renderPage({ conceptId: node.id, regions, notes });
    if (current && oldPath === path && current.content === content) continue;
    if (oldPath && oldPath !== path && current) files.push({ path: oldPath, after: null });
    files.push({ path, after: content });
    const action = !current ? "created" : oldPath !== path ? "moved" : keptEdited ? "kept_edited" : "updated";
    pages.push({ conceptId: node.id, path, action, ...(oldPath && oldPath !== path ? { from: oldPath } : {}) });
  }
  return { files, pages };
}

function bump(node: ConceptNode, created: boolean): ConceptNode {
  if (created) return node;
  return { ...node, version: node.version + 1, revisionId: newRevision(), parentRevisionIds: [node.revisionId] };
}

async function loadRecord(root: string, changeId: string): Promise<BookChangeRecord | null> {
  const content = await readTextOptional(abs(root, conceptChangePath(changeId)));
  return content === null ? null : JSON.parse(content);
}

async function historyAppend(root: string, node: ConceptNode, record: { changeId: string; reason: string; at: string }, operation: string): Promise<PlannedChange> {
  const path = conceptHistoryPath(node.id);
  const existing = (await readTextOptional(abs(root, path))) ?? "";
  return { path, after: `${existing}${JSON.stringify({ changeId: record.changeId, revisionId: node.revisionId, parentRevisionIds: node.parentRevisionIds, operation, reason: record.reason, at: record.at, snapshot: node })}\n` };
}

function summarizePages(pages: PageResult[]): string {
  return pages.map((p) => `${p.action} ${p.path}${p.from ? ` (← ${p.from})` : ""}`).join(", ") || "페이지 변경 없음";
}

async function computeBatch(root: string, actor: Actor, request: { changeId: string; reason: string; operations: BookOperation[] }, at: string) {
  if (!Array.isArray(request.operations) || !request.operations.length) throw new Error("operations가 필요합니다.");
  const before = await loadConcepts(root);
  const batch = new Batch(actor, at, before);
  for (const op of request.operations) await runOperation(root, batch, op);
  for (const id of batch.touched) {
    const node = batch.nodes.get(id)!;
    batch.nodes.set(id, bump(node, batch.created.has(id)));
  }
  assertTree([...batch.nodes.values()]);
  const { files, pages } = await planPages(root, batch, before);
  const changes: PlannedChange[] = [...files];
  for (const id of batch.touched) {
    const node = batch.nodes.get(id)!;
    changes.push({ path: conceptPath(id), after: encodeConcept(node) });
    changes.push(await historyAppend(root, node, { ...request, at }, request.operations.map((o) => o.op).join("+")));
  }
  if (batch.proposals.length) {
    const existing = (await readTextOptional(abs(root, PROPOSALS_FILE))) ?? "";
    changes.push({ path: PROPOSALS_FILE, after: `${existing}${batch.proposals.join("\n")}\n` });
  }
  return { changes, pages, nodes: [...batch.touched].map((id) => batch.nodes.get(id)!) };
}

/** Undo restores page files byte-for-byte and node content as a new version, only if nothing changed since. */
async function computeUndo(root: string, request: { changeId: string; reason: string; undo: string }, at: string) {
  const target = await loadRecord(root, request.undo);
  if (!target) throw new Error(`되돌릴 변경을 찾지 못했습니다: ${request.undo}`);
  const changes: PlannedChange[] = [];
  const nodes: ConceptNode[] = [];
  const pages: PageResult[] = [];
  for (const file of target.files) {
    const current = await readTextOptional(abs(root, file.path));
    if (current !== file.after) throw new Error(`이후 변경이 있어 되돌릴 수 없습니다: ${file.path}`);
    if (file.path.startsWith(`${CONCEPTS_DIR}/history/`) || file.path === PROPOSALS_FILE) continue;
    if (file.path.startsWith(`${CONCEPTS_DIR}/`)) {
      const now = JSON.parse(current!) as ConceptNode;
      const prior = file.before === null ? { ...now, retired: { at } } : (JSON.parse(file.before) as ConceptNode);
      const { schemaVersion: _s, id: _i, version: _v, revisionId: _r, parentRevisionIds: _p, ...content } = prior;
      const restored = { ...now, ...content, version: now.version + 1, revisionId: newRevision(), parentRevisionIds: [now.revisionId] } as ConceptNode;
      if (!("retired" in content)) delete restored.retired;
      changes.push({ path: file.path, after: encodeConcept(restored) });
      changes.push(await historyAppend(root, restored, { ...request, at }, "undo"));
      nodes.push(restored);
      continue;
    }
    changes.push({ path: file.path, after: file.before });
    const page = file.before === null ? null : parsePage(file.before);
    pages.push({ conceptId: page?.conceptId ?? "", path: file.path, action: file.before === null ? "removed" : file.after === null ? "created" : "updated" });
  }
  assertTree([...(await loadConcepts(root)).filter((n) => !nodes.some((x) => x.id === n.id)), ...nodes]);
  return { changes, pages, nodes };
}

/** Removed or moved pages leave directories behind; rmdir only succeeds on empty ones, so user files stay. */
async function pruneEmptyPageDirs(root: string, removed: string[]): Promise<void> {
  for (const path of removed) {
    if (!path.startsWith("book/")) continue;
    for (let dir = posix.dirname(path); dir !== "book" && dir.startsWith("book/"); dir = posix.dirname(dir)) {
      try {
        await rmdir(abs(root, dir));
      } catch {
        break;
      }
    }
  }
}

/**
 * Apply one book change atomically: concept nodes, append-only history,
 * page files (create/move/regenerate), proposals and the change record.
 * `actor` comes from the caller (agent tool vs user command), never from the payload.
 */
export async function applyBookChange(root: string, actor: Actor, request: BookChangeRequest, options: BookApplyOptions = {}): Promise<BookChangeResult> {
  if (!request || !CHANGE_ID.test(request.changeId ?? "")) throw new Error("changeId가 필요합니다.");
  if (typeof request.reason !== "string" || !request.reason.trim()) throw new Error("reason(변경 이유)이 필요합니다.");
  const payloadSha256 = sha256(JSON.stringify({ actor, request }));
  const existing = await loadRecord(root, request.changeId);
  if (existing) {
    if (existing.payloadSha256 !== payloadSha256) throw new Error(`같은 changeId로 다른 변경을 적용할 수 없습니다: ${request.changeId}`);
    return { status: "already_applied", changeId: request.changeId, pages: existing.pages, nodes: [], summary: existing.summary };
  }
  const at = (options.now ?? (() => new Date().toISOString()))();
  const computed = "undo" in request ? await computeUndo(root, request, at) : await computeBatch(root, actor, request, at);
  const files: FileRecord[] = [];
  for (const change of computed.changes) files.push({ path: change.path, before: await readTextOptional(abs(root, change.path)), after: change.after });
  const summary = `${"undo" in request ? `undo ${request.undo}` : "apply"}: ${summarizePages(computed.pages)} — ${request.reason}`;
  const record: BookChangeRecord = { changeId: request.changeId, reason: request.reason, actor, at, payloadSha256, ...("undo" in request ? { undoOf: request.undo } : {}), files, pages: computed.pages, summary };
  const plan = await preparePlan(root, `book-${request.changeId}`, [...computed.changes, { path: conceptChangePath(request.changeId), after: `${JSON.stringify(record, null, 2)}\n` }]);
  await executePlan(root, plan);
  await pruneEmptyPageDirs(root, computed.changes.filter((c) => c.after === null).map((c) => c.path));
  let dashboardWarning: string | undefined;
  try {
    await refreshDashboard(root);
  } catch (error) {
    dashboardWarning = `대시보드 갱신 실패: ${error instanceof Error ? error.message : String(error)}`;
  }
  return { status: "committed", changeId: request.changeId, pages: computed.pages, nodes: computed.nodes, summary, ...(dashboardWarning ? { dashboardWarning } : {}) };
}

