import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Missing file → null; every other error (including EISDIR/EACCES) propagates. */
export async function readTextOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export type AtomicWriteOptions = {
  /** undefined: no precondition; null: file must not exist; string: current SHA-256. */
  expectedSha256?: string | null;
  /** Test failpoint. */
  failBeforeRename?: boolean;
};

export async function currentSha256(path: string): Promise<string | null> {
  const content = await readTextOptional(path);
  return content === null ? null : sha256(content);
}

/** Write a temp file exclusively in the same directory, fsync it, then rename. */
export async function writeFileAtomic(
  path: string,
  content: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  if (options.expectedSha256 !== undefined) {
    const actual = await currentSha256(path);
    if (actual !== options.expectedSha256)
      throw new Error(`다른 변경이 먼저 저장됐습니다. 덮어쓰지 않습니다: ${path}`);
  }
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${randomUUID()}`);
  const handle = await open(temp, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    if (options.failBeforeRename) throw new Error("failpoint: before rename");
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function removeFileIfHash(path: string, expectedSha256: string): Promise<void> {
  const actual = await currentSha256(path);
  if (actual === null) return;
  if (actual !== expectedSha256)
    throw new Error(`다른 변경이 먼저 저장됐습니다. 삭제하지 않습니다: ${path}`);
  await rm(path);
}
