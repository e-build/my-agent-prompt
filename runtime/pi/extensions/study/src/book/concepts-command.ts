import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { requireWorkspace } from "../workspace/workspace-root.ts";
import { PROPOSALS_FILE } from "./book-changes.ts";
import { applyAndPublish } from "./site-write.ts";
import { bookTree, formatTree, type TreeLine } from "./book-query.ts";
import { abs } from "./book-store.ts";

export type ConceptsUi = {
  select(title: string, options: string[]): Promise<string | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  notify(message: string, level: "info" | "warning" | "error"): void;
};

const ACTIONS = ["최상위 영역 만들기", "개념 이름 바꾸기", "개념 옮기기", "개념 위계 보기", "에이전트 제안 보기"] as const;

const label = (l: TreeLine) => `${"  ".repeat(l.depth)}${l.name}${l.owner === "user" ? " [사용자]" : ""}`;

async function pick(ui: ConceptsUi, lines: TreeLine[], title: string, extra: string[] = []): Promise<TreeLine | string | undefined> {
  const labels = [...extra, ...lines.map(label)];
  const choice = await ui.select(title, labels);
  if (choice === undefined) return undefined;
  if (extra.includes(choice)) return choice;
  return lines[labels.indexOf(choice) - extra.length];
}

const changeId = () => `user-${randomUUID()}`;

/** User-side tree editing. Runs with actor=user, so edited nodes become user-owned. */
export async function runConceptsCommand(root: string, ui: ConceptsUi): Promise<void> {
  const action = await ui.select("교과서 개념 위계", [...ACTIONS]);
  if (!action) return;
  const lines = await bookTree(root);
  if (action === "개념 위계 보기") return ui.notify(formatTree(lines), "info");
  if (action === "에이전트 제안 보기") {
    const content = (await readTextOptional(abs(root, PROPOSALS_FILE))) ?? "";
    const names = new Map(lines.map((l) => [l.id, l.name]));
    const items = content.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return ui.notify(items.map((p) => `- ${names.get(p.conceptId) ?? p.conceptId}: ${p.message} (${p.at.slice(0, 10)})`).join("\n") || "제안이 없습니다.", "info");
  }
  if (action === "최상위 영역 만들기") {
    const name = await ui.input("새 최상위 영역 이름", "예: 동시성");
    if (!name?.trim()) return;
    const result = await applyAndPublish(root, "user", { changeId: changeId(), reason: "사용자가 최상위 영역을 만듦", operations: [{ op: "create", name, parentId: null }] });
    return ui.notify(result.summary, "info");
  }
  if (!lines.length) return ui.notify("개념이 없습니다. 먼저 최상위 영역을 만드세요.", "warning");
  const target = await pick(ui, lines, action === "개념 이름 바꾸기" ? "이름을 바꿀 개념" : "옮길 개념");
  if (!target || typeof target === "string") return;
  if (action === "개념 이름 바꾸기") {
    const name = await ui.input(`${target.name}의 새 이름`, target.name);
    if (!name?.trim() || name.trim() === target.name) return;
    const result = await applyAndPublish(root, "user", { changeId: changeId(), reason: "사용자가 이름을 바꿈", operations: [{ op: "rename", id: target.id, name, expectedRevisionId: target.revisionId }] });
    return ui.notify(result.summary, "info");
  }
  const TOP = "(최상위로)";
  const parent = await pick(ui, lines.filter((l) => l.id !== target.id && !l.path.startsWith(target.path.replace(/README\.md$/, ""))), `${target.name}을(를) 어디 아래로 옮길까요?`, [TOP]);
  if (!parent) return;
  const parentId = parent === TOP ? null : (parent as TreeLine).id;
  const result = await applyAndPublish(root, "user", { changeId: changeId(), reason: "사용자가 개념을 옮김", operations: [{ op: "move", id: target.id, parentId, expectedRevisionId: target.revisionId }] });
  ui.notify(result.summary, "info");
}

export function registerConceptsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("study-concepts", {
    description: "내 교과서의 개념 위계 정리 — 최상위 영역 만들기, 이름 바꾸기, 옮기기, 제안 보기",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const workspace = await requireWorkspace(ctx.cwd);
        await runConceptsCommand(workspace.root, ctx.ui);
      } catch (error) {
        ctx.ui.notify(`개념 위계를 바꾸지 못했습니다: ${error instanceof Error ? error.message : String(error)}`, "warning");
      }
    },
  });
}
