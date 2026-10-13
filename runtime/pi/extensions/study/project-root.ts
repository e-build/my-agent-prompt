import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export type StudyRootOptions = {
  projectSlug?: string;
  projectRoot?: string;
  allowCreate?: boolean;
};

function validateSlug(slug: string): void {
  if (!/^study-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`유효하지 않은 project slug입니다: ${slug}`);
  }
}

async function hasChapters(root: string): Promise<boolean> {
  try {
    return (await readdir(root, { withFileTypes: true })).some(entry => entry.isDirectory() && /^ch-\d+-/.test(entry.name));
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
}

async function manifestSlug(root: string): Promise<string | undefined> {
  const path = join(root, ".study", "project.json");
  let content: string;
  try { content = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const slug = JSON.parse(content)?.projectSlug;
    if (typeof slug !== "string") throw new Error("projectSlug 누락");
    validateSlug(slug);
    return slug;
  } catch (error) {
    throw new Error(`project.json이 올바르지 않습니다: ${path} (${error instanceof Error ? error.message : error})`);
  }
}

async function isProject(root: string): Promise<boolean> {
  if (!basename(root).startsWith("study-")) return false;
  if (await hasChapters(root)) return true;
  // Discover candidates without interpreting unrelated project metadata.
  try { return (await stat(join(root, ".study", "project.json"))).isFile(); }
  catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
}

async function enclosingProject(cwd: string): Promise<string | undefined> {
  let current = resolve(cwd);
  while (true) {
    if (await isProject(current)) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function validateRoot(root: string, options: StudyRootOptions): Promise<string> {
  const slug = basename(root);
  validateSlug(slug);
  if (options.projectSlug !== undefined && slug !== options.projectSlug) {
    throw new Error(`projectRoot와 projectSlug가 일치하지 않습니다: ${root} / ${options.projectSlug}`);
  }
  const storedSlug = await manifestSlug(root);
  if (storedSlug !== undefined && storedSlug !== slug) {
    throw new Error(`project.json의 projectSlug와 루트가 일치하지 않습니다: ${storedSlug} / ${root}`);
  }
  try {
    if (!(await stat(root)).isDirectory()) throw new Error(`projectRoot는 디렉토리여야 합니다: ${root}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!options.allowCreate && !await isProject(root)) {
    throw new Error(`학습 프로젝트를 찾지 못했습니다: ${root}`);
  }
  return root;
}

/** Resolve only; directory creation belongs to the calling artifact writer. */
export async function findStudyProjectRoot(cwd: string, options: StudyRootOptions = {}): Promise<string> {
  const absoluteCwd = resolve(cwd);
  if (options.projectSlug !== undefined) validateSlug(options.projectSlug);
  if (options.projectRoot !== undefined) {
    if (!options.projectRoot.trim()) throw new Error("projectRoot는 빈 경로일 수 없습니다.");
    const root = resolve(absoluteCwd, options.projectRoot);
    const parentProject = await enclosingProject(dirname(root));
    if (parentProject) throw new Error(`학습 프로젝트 안에 중첩 생성할 수 없습니다. 별도 projectRoot를 지정하세요: ${parentProject}`);
    return validateRoot(root, options);
  }

  const enclosing = await enclosingProject(absoluteCwd);
  if (enclosing) {
    if (options.projectSlug !== undefined && basename(enclosing) !== options.projectSlug) {
      throw new Error(`다른 학습 프로젝트 안에서는 명시적인 projectRoot가 필요합니다: ${enclosing}`);
    }
    return validateRoot(enclosing, options);
  }

  if (options.projectSlug !== undefined) {
    // A matching directory can exist before its manifest or chapters are written.
    let current = absoluteCwd;
    if (options.allowCreate) {
      while (true) {
        if (basename(current) === options.projectSlug) return validateRoot(current, options);
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    return validateRoot(join(absoluteCwd, options.projectSlug), options);
  }

  const entries = await readdir(absoluteCwd, { withFileTypes: true });
  const projects: string[] = [];
  for (const entry of entries.filter(entry => entry.isDirectory() && entry.name.startsWith("study-"))) {
    const root = join(absoluteCwd, entry.name);
    if (await isProject(root)) projects.push(root);
  }
  if (projects.length > 1) {
    throw new Error(`학습 프로젝트가 여러 개입니다. 원하는 프로젝트 디렉토리에서 실행하세요: ${projects.join(", ")}`);
  }
  if (projects.length === 1) return validateRoot(projects[0], options);
  throw new Error(`현재 경로에서 study-* 프로젝트를 찾지 못했습니다: ${cwd}`);
}
