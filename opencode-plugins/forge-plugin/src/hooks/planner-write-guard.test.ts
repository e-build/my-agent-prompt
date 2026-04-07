import { describe, expect, test } from "bun:test"
import { createPlannerWriteGuard } from "./planner-write-guard"

describe("createPlannerWriteGuard", () => {
  test("blocks planner writes outside .forge/plans", async () => {
    const sessionAgents = new Map<string, string>([["planner-session", "planner"]])
    const hook = createPlannerWriteGuard("/repo", sessionAgents)

    await expect(
      hook(
        { tool: "write", sessionID: "planner-session", callID: "c1" },
        { args: { filePath: "src/index.ts" } },
      ),
    ).rejects.toThrow("Planner may only edit .forge/plans/")
  })

  test("allows planner writes inside .forge/plans", async () => {
    const sessionAgents = new Map<string, string>([["planner-session", "planner"]])
    const hook = createPlannerWriteGuard("/repo", sessionAgents)

    await expect(
      hook(
        { tool: "write", sessionID: "planner-session", callID: "c1" },
        { args: { filePath: ".forge/plans/auth.md" } },
      ),
    ).resolves.toBeUndefined()
  })

  test("ignores non-planner sessions", async () => {
    const sessionAgents = new Map<string, string>([["worker-session", "worker"]])
    const hook = createPlannerWriteGuard("/repo", sessionAgents)

    await expect(
      hook(
        { tool: "edit", sessionID: "worker-session", callID: "c1" },
        { args: { filePath: "src/index.ts" } },
      ),
    ).resolves.toBeUndefined()
  })
})
