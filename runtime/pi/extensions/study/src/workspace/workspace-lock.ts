import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export const LOCK_PATH = ".study/local/locks/workspace.lock";

export type LockOptions = {
  timeoutMs?: number;
  isAlive?: (pid: number) => boolean;
};

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readLock(path: string): Promise<{ pid: number; token: string } | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return typeof value?.pid === "number" && typeof value?.token === "string" ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    // Partially written lock: treat as held until timeout instead of deleting it.
    return { pid: -1, token: "" };
  }
}

/**
 * Exclusive lock for one workspace on this PC. A lock is removed only after
 * confirming its owner process no longer exists and its token is unchanged.
 */
export async function withWorkspaceLock<T>(
  root: string,
  operation: () => Promise<T>,
  options: LockOptions = {},
): Promise<T> {
  const path = join(root, LOCK_PATH);
  const token = randomUUID();
  const isAlive = options.isAlive ?? processAlive;
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  await mkdir(dirname(path), { recursive: true });
  while (true) {
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, token, acquiredAt: new Date().toISOString() }));
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = await readLock(path);
      if (owner && owner.pid > 0 && owner.pid !== process.pid && !isAlive(owner.pid)) {
        const again = await readLock(path);
        if (again?.token === owner.token) await rm(path, { force: true });
        continue;
      }
      if (Date.now() > deadline)
        throw new Error(`다른 study 작업이 실행 중입니다. 잠시 후 다시 시도하세요: ${path}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  try {
    return await operation();
  } finally {
    const current = await readLock(path);
    if (current?.token === token) await rm(path, { force: true });
  }
}
