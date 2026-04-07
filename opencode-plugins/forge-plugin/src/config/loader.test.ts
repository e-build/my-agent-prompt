import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { ForgeConfig } from "./schema"
import { loadConfigFromPaths, mergeConfigs } from "./loader"

describe("mergeConfigs", () => {
  test("project config overrides user config", () => {
    const userConfig: ForgeConfig = {
      categories: {
        quick: { model: "anthropic/claude-haiku-4-5" },
      },
    }
    const projectConfig: ForgeConfig = {
      categories: {
        quick: { model: "openai/gpt-4o-mini" },
      },
    }

    expect(mergeConfigs(userConfig, projectConfig).categories?.quick?.model).toBe(
      "openai/gpt-4o-mini",
    )
  })

  test("preserves user config when project config absent", () => {
    const userConfig: ForgeConfig = {
      agents: {
        pilot: { model: "anthropic/claude-opus-4-6" },
      },
    }

    expect(mergeConfigs(userConfig, undefined)).toEqual(userConfig)
  })

  test("deep merges agent overrides for the same agent", () => {
    const userConfig: ForgeConfig = {
      agents: {
        pilot: { prompt_append: "Use concise outputs." },
      },
    }
    const projectConfig: ForgeConfig = {
      agents: {
        pilot: { model: "openai/gpt-5.4" },
      },
    }

    expect(mergeConfigs(userConfig, projectConfig).agents?.pilot).toEqual({
      model: "openai/gpt-5.4",
      prompt_append: "Use concise outputs.",
    })
  })
})

describe("loadConfigFromPaths", () => {
  let tempDir = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "forge-plugin-"))
  })

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  test("loads JSONC config files", async () => {
    const userPath = join(tempDir, "forge.jsonc")
    const projectPath = join(tempDir, "project.jsonc")

    await writeFile(
      userPath,
      `{
        // user defaults
        "categories": {
          "quick": { "model": "anthropic/claude-haiku-4-5" }
        }
      }`,
    )

    await writeFile(
      projectPath,
      `{
        "agents": {
          "pilot": { "model": "anthropic/claude-opus-4-6" }
        }
      }`,
    )

    const result = await loadConfigFromPaths(userPath, projectPath)

    expect(result.categories?.quick?.model).toBe("anthropic/claude-haiku-4-5")
    expect(result.agents?.pilot?.model).toBe("anthropic/claude-opus-4-6")
  })

  test("returns empty config when files do not exist", async () => {
    expect(await loadConfigFromPaths(join(tempDir, "missing.jsonc"), undefined)).toEqual(
      {},
    )
  })
})
