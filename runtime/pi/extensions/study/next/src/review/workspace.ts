import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveChannelId } from "../channel/select-channel.ts";
import { isValidTimezone } from "./review-date.ts";

export type WorkspaceProject = { id?: string; slug: string; path: string };
export type Workspace = {
  root: string;
  timezone: string;
  review: { intervals: number[] };
  projects: WorkspaceProject[];
  channel?: string;
};

const DEFAULT_INTERVALS = [1, 3, 7, 14];
const markerPath = (root: string) => join(root, ".study", "workspace.json");

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readRaw(root: string): Promise<Record<string, any>> {
  const path = markerPath(root);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`workspace.json이 손상됐습니다: ${path}`);
    throw error;
  }
}

async function writeRaw(root: string, value: Record<string, any>): Promise<void> {
  const path = markerPath(root);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

export async function readWorkspace(root: string): Promise<Workspace> {
  const raw = await readRaw(root);
  if (!isValidTimezone(raw.timezone)) throw new Error(`timezone이 올바르지 않습니다: ${raw.timezone}`);
  const intervals = raw.review?.intervals ?? DEFAULT_INTERVALS;
  const ascending =
    Array.isArray(intervals) &&
    intervals.length > 0 &&
    intervals.every(
      (n: unknown, i: number) =>
        Number.isInteger(n) && (n as number) > 0 && (i === 0 || (n as number) > intervals[i - 1]),
    );
  if (!ascending)
    throw new Error(
      `review.intervals는 증가하는 양의 정수여야 합니다: ${JSON.stringify(intervals)}`,
    );
  if (raw.channel !== undefined) resolveChannelId({ workspace: raw.channel });
  return {
    root,
    timezone: raw.timezone,
    review: { intervals },
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    ...(raw.channel !== undefined ? { channel: raw.channel } : {}),
  };
}

export async function findWorkspaceRoot(start: string): Promise<Workspace | null> {
  let current = resolve(start);
  while (true) {
    if (await exists(markerPath(current))) return readWorkspace(current);
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Creates a study root with defaults; an existing root is left untouched. */
export async function initWorkspace(root: string): Promise<Workspace> {
  if (!(await exists(markerPath(root))))
    await writeRaw(root, {
      schemaVersion: 1,
      workspaceId: `ws-${randomUUID().slice(0, 12)}`,
      timezone: "Asia/Seoul",
      review: { intervals: DEFAULT_INTERVALS },
      projects: [],
    });
  return readWorkspace(root);
}

export async function registerProject(root: string, project: WorkspaceProject): Promise<Workspace> {
  const raw = await readRaw(root);
  const projects: WorkspaceProject[] = Array.isArray(raw.projects) ? raw.projects : [];
  if (!projects.some((p) => p.slug === project.slug)) {
    projects.push({ id: `p-${randomUUID().slice(0, 12)}`, ...project });
    await writeRaw(root, { ...raw, projects });
  }
  return readWorkspace(root);
}
