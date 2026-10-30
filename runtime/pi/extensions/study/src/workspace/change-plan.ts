import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  currentSha256,
  readTextOptional,
  removeFileIfHash,
  sha256,
  writeFileAtomic,
} from "./atomic-file.ts";
import { safeProjectWritePath, safeWorkspacePath } from "./safe-path.ts";
import { withWorkspaceLock } from "./workspace-lock.ts";
import { COMMON_WRITE_ROOTS, isRelativeSafePath } from "./workspace-types.ts";

export type FileChange = {
  /** Root-relative POSIX path. */
  path: string;
  beforeSha256: string | null;
  before: string | null;
  afterSha256: string | null;
  after: string | null;
};

export type ChangePlan = {
  schemaVersion: 1;
  id: string;
  requestId: string;
  payloadSha256: string;
  createdAt: string;
  state: "prepared" | "applying" | "conflict";
  projectPaths: string[];
  /** Explicitly allowed single root files, e.g. `.gitignore` during registration. */
  rootFiles?: string[];
  changes: FileChange[];
};

export type PlannedChange = { path: string; after: string | null };

const PENDING_DIR = ".study/local/pending";
const APPLIED_DIR = ".study/local/applied";

function requestFile(requestId: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId))
    throw new Error(`requestId 형식이 올바르지 않습니다: ${requestId}`);
  return `${requestId.replace(/:/g, "_")}.json`;
}

/** Resolve a planned path to an absolute path inside an allowed write scope. */
export async function resolveChangePath(
  root: string,
  path: string,
  projectPaths: string[],
  rootFiles: string[] = [],
): Promise<string> {
  if (!isRelativeSafePath(path)) throw new Error(`허용되지 않는 경로입니다: ${path}`);
  if (rootFiles.includes(path) && !path.includes("/")) return safeProjectWritePath(root, path);
  if (COMMON_WRITE_ROOTS.includes(path.split("/")[0] as any)) return safeWorkspacePath(root, path);
  const project = projectPaths.find((p) => path.startsWith(`${p}/`));
  if (!project) throw new Error(`쓰기 허용 경로가 아닙니다: ${path}`);
  return safeProjectWritePath(join(root, ...project.split("/")), path.slice(project.length + 1));
}

function payloadDigest(changes: PlannedChange[]): string {
  return sha256(JSON.stringify(changes.map(({ path, after }) => [path, after])));
}

/** Read-only: compute a plan with full before/after content. */
export async function preparePlan(
  root: string,
  requestId: string,
  changes: PlannedChange[],
  options: { projectPaths?: string[]; rootFiles?: string[] } = {},
): Promise<ChangePlan> {
  if (!changes.length) throw new Error("변경할 파일이 없습니다.");
  const seen = new Set<string>();
  const projectPaths = [...(options.projectPaths ?? [])];
  const rootFiles = [...(options.rootFiles ?? [])];
  const planned: FileChange[] = [];
  for (const change of changes) {
    if (seen.has(change.path)) throw new Error(`같은 파일을 두 번 변경할 수 없습니다: ${change.path}`);
    seen.add(change.path);
    const absolute = await resolveChangePath(root, change.path, projectPaths, rootFiles);
    const before = await readTextOptional(absolute);
    planned.push({
      path: change.path,
      before,
      beforeSha256: before === null ? null : sha256(before),
      after: change.after,
      afterSha256: change.after === null ? null : sha256(change.after),
    });
  }
  const payloadSha256 = payloadDigest(changes);
  const applied = await readTextOptional(join(root, APPLIED_DIR, requestFile(requestId)));
  if (applied !== null && JSON.parse(applied).payloadSha256 !== payloadSha256)
    throw new Error(`같은 requestId로 다른 변경을 적용할 수 없습니다: ${requestId}`);
  return {
    schemaVersion: 1,
    id: `plan-${randomUUID()}`,
    requestId,
    payloadSha256,
    createdAt: new Date().toISOString(),
    state: "prepared",
    projectPaths,
    rootFiles,
    changes: planned,
  };
}

export async function listPendingPlans(root: string): Promise<ChangePlan[]> {
  let names: string[];
  try {
    names = await readdir(join(root, PENDING_DIR));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const plans: ChangePlan[] = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    const content = await readTextOptional(join(root, PENDING_DIR, name));
    if (content !== null) plans.push(JSON.parse(content));
  }
  return plans;
}

async function saveJournal(root: string, plan: ChangePlan): Promise<void> {
  const path = await safeWorkspacePath(root, `${PENDING_DIR}/${plan.id}.json`);
  await writeFileAtomic(path, `${JSON.stringify(plan, null, 2)}\n`);
}

async function finish(root: string, plan: ChangePlan, committed: boolean): Promise<void> {
  if (committed) {
    const path = await safeWorkspacePath(root, `${APPLIED_DIR}/${requestFile(plan.requestId)}`);
    await writeFileAtomic(
      path,
      `${JSON.stringify({ requestId: plan.requestId, planId: plan.id, payloadSha256: plan.payloadSha256, committedAt: new Date().toISOString() })}\n`,
    );
  }
  await rm(join(root, PENDING_DIR, `${plan.id}.json`), { force: true });
}

async function writeTarget(absolute: string, content: string | null, expected: string | null) {
  if (content === null) {
    if (expected !== null) await removeFileIfHash(absolute, expected);
    return;
  }
  await writeFileAtomic(absolute, content, { expectedSha256: expected });
}

export type ExecuteResult = { status: "committed" | "already_applied"; planId: string };

/**
 * Prepared → journaled → each file CAS-replaced → applied record → journal removed.
 * Any failure after journaling leaves a pending plan for `recoverPlan`.
 */
export async function executePlan(
  root: string,
  plan: ChangePlan,
  options: { failAfterWrites?: number } = {},
): Promise<ExecuteResult> {
  return withWorkspaceLock(root, async () => {
    const applied = await readTextOptional(join(root, APPLIED_DIR, requestFile(plan.requestId)));
    if (applied !== null) {
      if (JSON.parse(applied).payloadSha256 !== plan.payloadSha256)
        throw new Error(`같은 requestId로 다른 변경을 적용할 수 없습니다: ${plan.requestId}`);
      return { status: "already_applied", planId: JSON.parse(applied).planId };
    }
    const pending = await listPendingPlans(root);
    if (pending.length)
      throw new Error(
        `미완료 변경 계획이 있습니다. /study-workspace recover로 먼저 정리하세요: ${pending.map((p) => p.id).join(", ")}`,
      );
    const targets: string[] = [];
    for (const change of plan.changes) {
      const absolute = await resolveChangePath(root, change.path, plan.projectPaths, plan.rootFiles);
      if ((await currentSha256(absolute)) !== change.beforeSha256)
        throw new Error(`다른 변경이 먼저 저장됐습니다. 다시 비교하세요: ${change.path}`);
      targets.push(absolute);
    }
    const journal: ChangePlan = { ...plan, state: "applying" };
    await saveJournal(root, journal);
    for (let i = 0; i < plan.changes.length; i++) {
      if (options.failAfterWrites === i) throw new Error(`failpoint: after ${i} writes`);
      const change = plan.changes[i];
      await writeTarget(targets[i], change.after, change.beforeSha256);
    }
    if (options.failAfterWrites === plan.changes.length)
      throw new Error(`failpoint: after ${plan.changes.length} writes`);
    await finish(root, journal, true);
    return { status: "committed", planId: plan.id };
  });
}

export type FileRecoveryState = "before" | "after" | "external";

export async function classifyPlanFiles(
  root: string,
  plan: ChangePlan,
): Promise<Array<{ path: string; state: FileRecoveryState }>> {
  const result: Array<{ path: string; state: FileRecoveryState }> = [];
  for (const change of plan.changes) {
    const absolute = await resolveChangePath(root, change.path, plan.projectPaths, plan.rootFiles);
    const actual = await currentSha256(absolute);
    result.push({
      path: change.path,
      state:
        actual === change.afterSha256
          ? "after"
          : actual === change.beforeSha256
            ? "before"
            : "external",
    });
  }
  return result;
}

/** Complete (retry) or undo (rollback) a pending plan without touching foreign edits. */
export async function recoverPlan(
  root: string,
  planId: string,
  mode: "retry" | "rollback",
): Promise<{ status: "committed" | "rolled_back"; planId: string }> {
  return withWorkspaceLock(root, async () => {
    const plan = (await listPendingPlans(root)).find((p) => p.id === planId);
    if (!plan) throw new Error(`미완료 변경 계획을 찾지 못했습니다: ${planId}`);
    const states = await classifyPlanFiles(root, plan);
    const external = states.filter((s) => s.state === "external");
    if (external.length) {
      await saveJournal(root, { ...plan, state: "conflict" });
      throw new Error(
        `외부 변경이 있어 자동 복구를 멈췄습니다. 해당 파일을 확인하세요: ${external.map((s) => s.path).join(", ")}`,
      );
    }
    for (let i = 0; i < plan.changes.length; i++) {
      const change = plan.changes[i];
      const absolute = await resolveChangePath(root, change.path, plan.projectPaths, plan.rootFiles);
      if (mode === "retry" && states[i].state === "before")
        await writeTarget(absolute, change.after, change.beforeSha256);
      if (mode === "rollback" && states[i].state === "after" && change.afterSha256 !== change.beforeSha256)
        await writeTarget(absolute, change.before, change.afterSha256);
    }
    await finish(root, plan, mode === "retry");
    return { status: mode === "retry" ? "committed" : "rolled_back", planId };
  });
}
