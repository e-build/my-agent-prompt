import { classifyPlanFiles, listPendingPlans, recoverPlan, type FileRecoveryState } from "./change-plan.ts";

export type RecoveryReport = {
  planId: string;
  requestId: string;
  createdAt: string;
  files: Array<{ path: string; state: FileRecoveryState }>;
  /** False when some file was changed by someone else after the plan started. */
  recoverable: boolean;
};

/** Read-only summary of interrupted changes. */
export async function inspectRecovery(root: string): Promise<RecoveryReport[]> {
  const reports: RecoveryReport[] = [];
  for (const plan of await listPendingPlans(root)) {
    const files = await classifyPlanFiles(root, plan);
    reports.push({
      planId: plan.id,
      requestId: plan.requestId,
      createdAt: plan.createdAt,
      files,
      recoverable: files.every((file) => file.state !== "external"),
    });
  }
  return reports;
}

export async function recoverAll(
  root: string,
  mode: "retry" | "rollback",
): Promise<Array<{ planId: string; status: "committed" | "rolled_back" | "conflict"; message?: string }>> {
  const results = [];
  for (const plan of await listPendingPlans(root)) {
    try {
      results.push(await recoverPlan(root, plan.id, mode));
    } catch (error) {
      results.push({
        planId: plan.id,
        status: "conflict" as const,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
