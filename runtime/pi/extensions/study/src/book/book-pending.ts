import { join } from "node:path";
import { readTextOptional } from "../workspace/atomic-file.ts";
import { readWorkspace } from "../workspace/workspace-root.ts";
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
