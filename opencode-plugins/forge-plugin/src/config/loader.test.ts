import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { ForgeConfig } from "./schema"
import { loadConfigFromPaths, mergeConfigs } from "./loader"

describe("mergeConfigs", () => {
  test("project config overrides user config", () => {
    const userConfig: ForgeConfig = {
      agents: {
        researcher: { model: "openai/gpt-5.4" },
        scouter: { model: "anthropic/claude-haiku-4-5" },
      },
    }
    const projectConfig: ForgeConfig = {
      agents: {
        researcher: { prompt_append: "Prefer official docs." },
        scouter: { model: "openai/gpt-4o-mini" },
      },
    }

    expect(mergeConfigs(userConfig, projectConfig).agents?.scouter?.model).toBe(
      "openai/gpt-4o-mini",
    )
    expect(mergeConfigs(userConfig, projectConfig).agents?.researcher).toEqual({
      fallback_models: [],
      model: "openai/gpt-5.4",
      prompt_append: "Prefer official docs.",
    })
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
      fallback_models: [],
      model: "openai/gpt-5.4",
      prompt_append: "Use concise outputs.",
    })
  })

  test("inherits user fallback models when project only changes prompt append", () => {
    const result = mergeConfigs(
      {
        agents: {
          worker: {
            model: "anthropic/claude-sonnet-4-6",
            fallback_models: ["openai/gpt-5.4", "openai/gpt-5-mini"],
          },
        },
      },
      {
        agents: {
          worker: { prompt_append: "Focus on diffs." },
        },
      },
    )

    expect(result.agents?.worker).toEqual({
      model: "anthropic/claude-sonnet-4-6",
      fallback_models: ["openai/gpt-5.4", "openai/gpt-5-mini"],
      prompt_append: "Focus on diffs.",
    })
  })

  test("drops inherited fallback models when project overrides primary model", () => {
    const result = mergeConfigs(
      {
        agents: {
          worker: {
            model: "anthropic/claude-sonnet-4-6",
            fallback_models: ["openai/gpt-5.4", "openai/gpt-5-mini"],
          },
        },
      },
      {
        agents: {
          worker: { model: "openai/gpt-5-codex" },
        },
      },
    )

    expect(result.agents?.worker).toEqual({
      model: "openai/gpt-5-codex",
      fallback_models: [],
    })
  })

  test("uses project fallback models when explicitly provided", () => {
    const result = mergeConfigs(
      {
        agents: {
          worker: {
            model: "anthropic/claude-sonnet-4-6",
            fallback_models: ["openai/gpt-5.4"],
          },
        },
      },
      {
        agents: {
          worker: {
            model: "openai/gpt-5-codex",
            fallback_models: ["anthropic/claude-sonnet-4-6"],
          },
        },
      },
    )

    expect(result.agents?.worker).toEqual({
      model: "openai/gpt-5-codex",
      fallback_models: ["anthropic/claude-sonnet-4-6"],
    })
  })

  test("allows project config to override inherited fallbacks without changing model", () => {
    const result = mergeConfigs(
      {
        agents: {
          worker: {
            model: "anthropic/claude-sonnet-4-6",
            fallback_models: ["openai/gpt-5.4"],
          },
        },
      },
      {
        agents: {
          worker: {
            fallback_models: [],
          },
        },
      },
    )

    expect(result.agents?.worker).toEqual({
      model: "anthropic/claude-sonnet-4-6",
      fallback_models: [],
    })
  })

  test("preserves disable_builtin_agents when configs are merged", () => {
    const result = mergeConfigs(
      {
        disable_builtin_agents: true,
      },
      {
        agents: {
          worker: { model: "openai/gpt-5-codex" },
        },
      },
    )

    expect(result.disable_builtin_agents).toBe(true)
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
    const userPath = join(tempDir, "forge-config.jsonc")
    const projectPath = join(tempDir, "project.jsonc")

    await writeFile(
      userPath,
      `{
        // user defaults
        "agents": {
          "scouter": { "model": "anthropic/claude-haiku-4-5" }
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

    expect(result.agents?.scouter?.model).toBe("anthropic/claude-haiku-4-5")
    expect(result.agents?.pilot?.model).toBe("anthropic/claude-opus-4-6")
  })

  test("returns empty config when files do not exist", async () => {
    expect(await loadConfigFromPaths(join(tempDir, "missing.jsonc"), undefined)).toEqual(
      {},
    )
  })
})
