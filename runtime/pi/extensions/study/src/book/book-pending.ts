import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { findWorkspaceRoot, readWorkspace } from "../workspace/workspace-root.ts";
import { loadConcepts } from "./book-store.ts";

export type PendingChapter = { projectId: string; projectSlug: string; chapterSlug: string; completedOn: string | null };

type StateShape = {
  chapters?: Record<string, { test?: { status?: string } }>;
  chapterCompletions?: Record<string, { completedOn?: string }>;
};

/**
 * Derived, never stored: completed chapters (test completed) that no concept
 * lists in `learnedIn`. Unreadable project states are skipped.
 */
export async function pendingChapters(root: string): Promise<PendingChapter[]> {
  const learned = new Set(
    (await loadConcepts(root)).filter((n) => !n.retired).flatMap((n) => n.learnedIn.map((l) => `${l.projectId}/${l.chapterSlug}`)),
  );
  const pending: PendingChapter[] = [];
  for (const project of (await readWorkspace(root)).manifest.projects) {
    let state: StateShape;
    try {
      state = JSON.parse((await readTextOptional(join(root, ...project.path.split("/"), ".study", "state.json"))) ?? "{}");
    } catch {
      continue;
    }
    for (const [chapterSlug, chapter] of Object.entries(state.chapters ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (chapter?.test?.status !== "completed") continue;
      if (learned.has(`${project.id}/${chapterSlug}`)) continue;
      pending.push({ projectId: project.id, projectSlug: project.slug, chapterSlug, completedOn: state.chapterCompletions?.[chapterSlug]?.completedOn ?? null });
    }
  }
  return pending;
}

/** Informational session-start line; null when nothing waits or cwd is outside a registered root. */
export async function bookPendingNotice(cwd: string): Promise<string | null> {
  const workspace = await findWorkspaceRoot(cwd).catch(() => null);
  if (!workspace) return null;
  const pending = await pendingChapters(workspace.root);
  if (!pending.length) return null;
  const names = pending.slice(0, 3).map((p) => `${p.projectSlug} · ${p.chapterSlug}`).join(", ");
  return `교과서 정리 대기 ${pending.length}개: ${names}${pending.length > 3 ? " …" : ""}\n/study-chapter 메뉴의 "교과서 정리"로 이어서 할 수 있습니다.`;
}
