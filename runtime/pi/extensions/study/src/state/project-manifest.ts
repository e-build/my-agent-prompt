import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type LabMode = "cli" | "application" | "document" | "mixed";

export const PLACEMENT_REASONS = ["route_decided", "limit_reached", "user_request"] as const;
export type PlacementReason = (typeof PLACEMENT_REASONS)[number];

export type ChapterStart = { startAt: string; skip: string[]; focus: string[]; unverified: string[] };

/** Public result of the one placement diagnosis. Never carries answer keys. */
export type PlacementSummary = {
  reason: PlacementReason;
  summary: string;
  startAt: string;
  focus: string[];
  skip: Array<{ what: string; reason: string }>;
  unverified: string[];
  questionCount: number;
  chapters: Record<string, ChapterStart>;
};

export type StudyProjectManifest = {
  version: 1;
  projectSlug: string;
  topic: string;
  channel?: string;
  environment?: {
    language?: string;
    framework?: string;
    buildTool?: string;
    runtimeVersion?: string;
    sharedWorkspace?: string;
    services?: Array<{ name: string; hostPort?: number; containerPort?: number; image?: string }>;
  };
  placement?: PlacementSummary;
  chapters: Record<
    string,
    { title: string; lab?: { mode: LabMode; workspace?: string; package?: string; evidence?: string[] } }
  >;
};

const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const CHAPTER = /^ch-\d{2}-[a-z0-9-]+$/;

export function parsePlacement(value: unknown): PlacementSummary {
  const p = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  if (!(PLACEMENT_REASONS as readonly string[]).includes(p.reason))
    throw new Error(`reason은 ${PLACEMENT_REASONS.join("|")} 중 하나여야 합니다.`);
  if (typeof p.summary !== "string" || typeof p.startAt !== "string")
    throw new Error("summary와 startAt이 필요합니다.");
  const chapters: Record<string, ChapterStart> = {};
  for (const [slug, c] of Object.entries((p.chapters ?? {}) as Record<string, any>)) {
    if (!CHAPTER.test(slug) || typeof c?.startAt !== "string") continue;
    chapters[slug] = {
      startAt: c.startAt,
      skip: strings(c.skip),
      focus: strings(c.focus),
      unverified: strings(c.unverified),
    };
  }
  return {
    reason: p.reason,
    summary: p.summary,
    startAt: p.startAt,
    focus: strings(p.focus),
    skip: Array.isArray(p.skip)
      ? p.skip.map((s: any) => ({ what: String(s?.what ?? ""), reason: String(s?.reason ?? "") }))
      : [],
    unverified: strings(p.unverified),
    questionCount: Number.isInteger(p.questionCount) ? p.questionCount : 0,
    chapters,
  };
}

const manifestPath = (projectRoot: string) => join(projectRoot, ".study", "project.json");

export async function saveProjectManifest(
  projectRoot: string,
  manifest: StudyProjectManifest,
): Promise<void> {
  await mkdir(join(projectRoot, ".study"), { recursive: true });
  const target = manifestPath(projectRoot);
  const temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

export async function loadProjectManifest(projectRoot: string): Promise<StudyProjectManifest | null> {
  const path = manifestPath(projectRoot);
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`project.json이 손상됐습니다: ${path}`);
  }
}

export async function updateProjectManifest(
  projectRoot: string,
  change: (manifest: StudyProjectManifest) => StudyProjectManifest,
): Promise<StudyProjectManifest> {
  const current = await loadProjectManifest(projectRoot);
  if (!current) throw new Error(`project.json이 없습니다: ${manifestPath(projectRoot)}`);
  const next = change(current);
  await saveProjectManifest(projectRoot, next);
  return next;
}
