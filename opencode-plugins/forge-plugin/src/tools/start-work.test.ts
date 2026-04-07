import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { startWorkTool } from "./start-work"

describe("startWorkTool", () => {
  let tempDir = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "forge-start-work-"))
    await mkdir(join(tempDir, ".forge", "plans"), { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  test("loads explicit plan and writes state", async () => {
    await writeFile(
      join(tempDir, ".forge", "plans", "auth.md"),
      "# Plan: auth\n\n- [ ] Task 1",
      "utf8",
    )

    const result = await startWorkTool.execute(
      { plan: "auth" },
      {
        sessionID: "sess-1",
        messageID: "msg-1",
        agent: "pilot",
        directory: tempDir,
        worktree: tempDir,
        abort: new AbortController().signal,
        metadata() {},
        async ask() {},
      },
    )

    expect(result).toContain("# Active Forge Plan")
    expect(result).toContain("# Plan: auth")

    const state = await readFile(join(tempDir, ".forge", "state.json"), "utf8")
    expect(state).toContain('"active_plan": ".forge/plans/auth.md"')
    expect(state).toContain('"sess-1"')
  })
})
