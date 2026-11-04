import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTextOptional, sha256, writeFileAtomic } from "../workspace/atomic-file.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
import { loadAllItems } from "../knowledge/knowledge-store.ts";
import { dueReviews } from "../review/review-query.ts";
import { abs, CONCEPT_CHANGES_DIR, loadConcepts } from "./book-store.ts";
import { activeById, BOOK_DIR, childrenOf, pagePath, relativeLink } from "./book-tree.ts";
import { pendingChapters } from "./book-pending.ts";
import type { ConceptNode } from "./book-types.ts";

export const DASHBOARD_PATH = `${BOOK_DIR}/README.md`;
const OPEN = /^<!-- study:book region=dashboard hash=([0-9a-f]{12}) -->\n/;
const CLOSE = "<!-- /study:book -->";
const PROPOSALS = "knowledge/concepts/proposals.jsonl";

function subtree(byId: Map<string, ConceptNode>, id: string): ConceptNode[] {
  return childrenOf(byId, id).flatMap((c) => [c, ...subtree(byId, c.id)]);
}

async function recentChanges(root: string, limit = 5): Promise<Array<{ at: string; changeId: string; reason: string }>> {
  let names: string[];
  try {
    names = (await readdir(abs(root, CONCEPT_CHANGES_DIR))).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const records = [];
  for (const name of names) {
    try {
      const r = JSON.parse((await readTextOptional(join(abs(root, CONCEPT_CHANGES_DIR), name)))!);
      records.push({ at: String(r.at), changeId: String(r.changeId), reason: String(r.reason) });
    } catch {
      /* skip */
    }
  }
  return records.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** Names and counts only: proposition statements and answers never appear here. */
export async function renderDashboard(root: string, options: { today?: string } = {}): Promise<string> {
  const byId = activeById(await loadConcepts(root));
  const areas = childrenOf(byId, null);
  const self = DASHBOARD_PATH;
  const lines: string[] = ["# 내 교과서", ""];

  lines.push("## 영역", "", "| 영역 | 페이지 | 지식 | 챕터 |", "|---|---|---|---|");
  for (const area of areas) {
    const nodes = [area, ...subtree(byId, area.id)];
    const chapters = new Set(nodes.flatMap((n) => n.learnedIn.map((l) => `${l.projectId}/${l.chapterSlug}`)));
    lines.push(`| ${area.name} | ${nodes.length} | ${nodes.reduce((s, n) => s + n.members.length, 0)} | ${chapters.size} |`);
  }
  if (!areas.length) lines.push("| (영역 없음 — /study-concepts로 만듭니다) | 0 | 0 | 0 |");

  lines.push("", "## 목차", "");
  const walk = (parent: string | null, depth: number) => {
    for (const node of childrenOf(byId, parent)) {
      const counts = depth ? ` · 지식 ${node.members.length} · 챕터 ${node.learnedIn.length}` : "";
      lines.push(`${"  ".repeat(depth)}- [${node.name}](${relativeLink(self, pagePath(byId, node))})${counts}`);
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);

  lines.push("", "## 학습 현황", "", "| 프로젝트 | 완료 챕터 |", "|---|---|");
  for (const project of (await readWorkspace(root)).manifest.projects) {
    let chapters: Record<string, { test?: { status?: string } }> = {};
    try {
      chapters = JSON.parse((await readTextOptional(join(root, ...project.path.split("/"), ".study", "state.json"))) ?? "{}").chapters ?? {};
    } catch {
      /* unreadable state: counts stay 0 */
    }
    const all = Object.values(chapters);
    lines.push(`| ${project.slug} | ${all.filter((c) => c?.test?.status === "completed").length} / ${all.length} |`);
  }

  const due = await dueReviews(root, options.today ? { today: options.today } : {}).catch(() => null);
  const placed = new Set([...byId.values()].flatMap((n) => n.members));
  const unplaced = (await loadAllItems(root)).filter((i) => !i.mergedInto && i.status !== "retired" && !placed.has(i.id));
  const pending = await pendingChapters(root);
  const proposals = ((await readTextOptional(abs(root, PROPOSALS))) ?? "").split("\n").filter(Boolean).length;
  lines.push(
    "",
    "## 할 일",
    "",
    `- 복습: ${due ? `오늘 ${due.items.filter((i) => i.timing === "today").length}개 · 밀림 ${due.items.filter((i) => i.timing === "overdue").length}개` : "확인 못 함"}`,
    `- 교과서 정리 대기: ${pending.length}개${pending.length ? ` — ${pending.slice(0, 5).map((p) => `${p.projectSlug} · ${p.chapterSlug}`).join(", ")}` : ""}`,
    `- 미배치 지식: ${unplaced.length}개`,
    `- 검토할 제안: ${proposals}개 (/study-concepts → 에이전트 제안 보기)`,
  );

  const recent = await recentChanges(root);
  lines.push("", "## 최근 교과서 변경", "");
  lines.push(...(recent.length ? recent.map((r) => `- ${r.at.slice(0, 10)} · ${r.changeId} · ${r.reason}`) : ["- (없음)"]));
  return lines.join("\n");
}

/** Rewrite the managed region; notes after it are kept. A broken marker is reported, never repaired. */
export async function refreshDashboard(root: string, options: { today?: string } = {}): Promise<string> {
  const path = abs(root, DASHBOARD_PATH);
  const current = await readTextOptional(path);
  let notes = "## 메모\n";
  if (current !== null) {
    const open = OPEN.exec(current);
    const close = current.indexOf(`\n${CLOSE}`);
    if (!open || close < 0) throw new Error(`대시보드 관리 영역이 손상됐습니다. 자동 수정하지 않습니다: ${DASHBOARD_PATH}`);
    notes = current.slice(close + 1 + CLOSE.length).replace(/^\n+/, "") || notes;
  }
  const body = await renderDashboard(root, options);
  const next = `<!-- study:book region=dashboard hash=${sha256(body).slice(0, 12)} -->\n${body}\n${CLOSE}\n\n${notes}`;
  if (next !== current) await writeFileAtomic(path, next, { expectedSha256: current === null ? null : sha256(current) });
  return DASHBOARD_PATH;
}
