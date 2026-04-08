import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { bindModelsTool, recommendModelsTool } from "./model-bindings"

describe("model binding tools", () => {
  let tempDir = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "forge-model-bindings-"))
  })

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  test("recommendModelsTool renders recommendations without writing config", async () => {
    const result = await recommendModelsTool.execute(
      {
        models: ["cp-openai/gpt-5.4", "cp-github-copilot/claude-sonnet-4.6"],
      },
      toolContext(tempDir),
    )

    expect(result).toContain("Forge model recommendations")
    expect(result).toContain("pilot")
    expect(result).toContain("cp-openai/gpt-5.4")

    await expect(readFile(join(tempDir, ".forge", "config.jsonc"), "utf8")).rejects.toThrow()
  })

  test("bindModelsTool requires explicit approval before writing config", async () => {
    const result = await bindModelsTool.execute(
      {
        approved: false,
        models: ["cp-openai/gpt-5.4"],
      },
      toolContext(tempDir),
    )

    expect(result).toContain("approval")
    await expect(readFile(join(tempDir, ".forge", "config.jsonc"), "utf8")).rejects.toThrow()
  })

  test("bindModelsTool writes approved model bindings and preserves config", async () => {
    await mkdir(join(tempDir, ".forge"), { recursive: true })
    await writeFile(
      join(tempDir, ".forge", "config.jsonc"),
      JSON.stringify(
        {
          disabled_agents: ["architect"],
          agents: {
            worker: { prompt_append: "Be concise." },
          },
        },
        null,
        2,
      ),
      "utf8",
    )

    const result = await bindModelsTool.execute(
      {
        approved: true,
        models: [
          "cp-openai/gpt-5.4",
          "cp-github-copilot/claude-sonnet-4.6",
          "cp-github-copilot/claude-haiku-4.5",
        ],
      },
      toolContext(tempDir),
    )

    expect(result).toContain("Updated .forge/config.jsonc")
    const config = await readFile(join(tempDir, ".forge", "config.jsonc"), "utf8")
    expect(config).toContain('"disabled_agents": [')
    expect(config).toContain('"prompt_append": "Be concise."')
    expect(config).toContain('"model": "cp-github-copilot/claude-sonnet-4.6"')
  })
})

function toolContext(directory: string) {
  return {
    sessionID: "sess-1",
    messageID: "msg-1",
    agent: "pilot",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata() {},
    async ask() {},
  }
}
