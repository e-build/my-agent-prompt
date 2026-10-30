import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type LabMode = "cli" | "application" | "document" | "mixed";

export type StudyProjectManifest = {
  version: 1;
  /** Stable workspace project ID, added when a workspace is registered. */
  projectId?: string;
  projectSlug: string;
  topic: string;
  environment?: {
    language?: string;
    framework?: string;
    buildTool?: string;
    runtimeVersion?: string;
    sharedWorkspace?: string;
    services?: Array<{ name: string; hostPort?: number; containerPort?: number; image?: string }>;
  };
  chapters: Record<
    string,
    {
      title: string;
      lab?: { mode: LabMode; workspace?: string; package?: string; evidence?: string[] };
    }
  >;
};

export function manifestFromCurriculum(
  payload: unknown,
  projectSlug: string,
  topic: string,
): StudyProjectManifest {
  const value = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const chapters: StudyProjectManifest["chapters"] = {};
  for (const phase of Array.isArray(value.phases) ? value.phases : []) {
    for (const chapter of Array.isArray(phase?.chapters) ? phase.chapters : []) {
      if (typeof chapter?.slug !== "string") continue;
      chapters[chapter.slug] = {
        title: String(chapter.title ?? chapter.slug),
        ...(chapter.lab && typeof chapter.lab === "object"
          ? {
              lab: {
                mode: ["cli", "application", "document", "mixed"].includes(chapter.lab.mode)
                  ? chapter.lab.mode
                  : "mixed",
                ...(chapter.lab.workspace ? { workspace: String(chapter.lab.workspace) } : {}),
                ...(chapter.lab.package ? { package: String(chapter.lab.package) } : {}),
                ...(Array.isArray(chapter.lab.evidence)
                  ? { evidence: chapter.lab.evidence.map(String) }
                  : {}),
              },
            }
          : {}),
      };
    }
  }
  return {
    version: 1,
    projectSlug,
    topic,
    ...(value.environment && typeof value.environment === "object"
      ? { environment: value.environment }
      : {}),
    chapters,
  };
}

export async function saveProjectManifest(
  projectRoot: string,
  manifest: StudyProjectManifest,
): Promise<void> {
  const dir = join(projectRoot, ".study");
  await mkdir(dir, { recursive: true });
  const target = join(dir, "project.json");
  const temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

export async function loadProjectManifest(
  projectRoot: string,
): Promise<StudyProjectManifest | null> {
  const path = join(projectRoot, ".study", "project.json");
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
