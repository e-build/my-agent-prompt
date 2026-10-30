import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { COMMON_WRITE_ROOTS, isRelativeSafePath } from "./workspace-types.ts";

async function lstatOptional(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return null;
    throw error;
  }
}

/** Reject any existing symlink between base (exclusive) and the target (inclusive). */
async function assertNoSymlinks(base: string, parts: string[]): Promise<void> {
  let current = base;
  for (const part of parts) {
    current = join(current, part);
    const info = await lstatOptional(current);
    if (!info) return;
    if (info.isSymbolicLink())
      throw new Error(`심볼릭 링크를 경유하는 경로에는 쓸 수 없습니다: ${current}`);
  }
}

function split(relativePath: string): string[] {
  if (!isRelativeSafePath(relativePath))
    throw new Error(`허용되지 않는 경로입니다. 루트 기준 상대 경로만 사용하세요: ${relativePath}`);
  return relativePath.split("/");
}

/** Root-level common data: only `.study/`, `knowledge/`, `review/`. */
export async function safeWorkspacePath(root: string, relativePath: string): Promise<string> {
  const parts = split(relativePath);
  if (!COMMON_WRITE_ROOTS.includes(parts[0] as (typeof COMMON_WRITE_ROOTS)[number]))
    throw new Error(`루트 공통 쓰기 경로가 아닙니다: ${relativePath}`);
  const base = resolve(root);
  await assertNoSymlinks(base, parts);
  return join(base, ...parts);
}

/** Paths inside one registered project directory. */
export async function safeProjectWritePath(
  projectRoot: string,
  relativePath: string,
): Promise<string> {
  const parts = split(relativePath);
  const base = resolve(projectRoot);
  await assertNoSymlinks(base, parts);
  return join(base, ...parts);
}
