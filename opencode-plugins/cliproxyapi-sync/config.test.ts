import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"

import type { Config } from "@opencode-ai/plugin"

import {
  buildMissingConfigMessage,
  ensureCliproxyapiConfigBootstrap,
  getConfigPath,
  getPluginConfigPath,
  loadSeedProviderState,
  loadPluginConfig,
  readPersistedConfig,
} from "./config"

describe("cliproxyapi config bootstrap", () => {
  let tempDir = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "cliproxyapi-config-"))
    process.env.OPENCODE_CONFIG_PATH = join(tempDir, ".config", "opencode", "opencode.json")
  })

  afterEach(async () => {
    delete process.env.OPENCODE_CONFIG_PATH
    await rm(tempDir, { force: true, recursive: true })
  })

  test("derives the plugin config path next to opencode.json", () => {
    expect(getConfigPath()).toBe(join(tempDir, ".config", "opencode", "opencode.json"))
    expect(getPluginConfigPath()).toBe(join(tempDir, ".config", "opencode", "cliproxyapi-sync-config.jsonc"))
  })

  test("bootstraps a commented cliproxyapi-sync config file without overwriting existing content", async () => {
    const pluginConfigPath = getPluginConfigPath()

    await ensureCliproxyapiConfigBootstrap(pluginConfigPath)

    const initial = await readFile(pluginConfigPath, "utf8")
    expect(initial).toContain('"baseURL": "http://localhost:8317/v1"')
    expect(initial).toContain('"apiKey": ""')
    expect(initial).toContain("Optional. If omitted")

    await writeFile(pluginConfigPath, "{\n  \"apiKey\": \"keep-me\"\n}\n", "utf8")
    await ensureCliproxyapiConfigBootstrap(pluginConfigPath)

    expect(await readFile(pluginConfigPath, "utf8")).toBe("{\n  \"apiKey\": \"keep-me\"\n}\n")
  })

  test("parses jsonc config files with comments", async () => {
    const pluginConfigPath = getPluginConfigPath()

    await mkdir(dirname(pluginConfigPath), { recursive: true })
    await writeFile(
      pluginConfigPath,
      `{
  // local cliproxyapi endpoint
  "baseURL": "http://localhost:8317/v1",
  "apiKey": "test-api-key",
  "managementKey": "secret"
}
`,
      "utf8",
    )

    await expect(loadPluginConfig(pluginConfigPath)).resolves.toEqual({
      baseURL: "http://localhost:8317/v1",
      apiKey: "test-api-key",
      managementKey: "secret",
    })
  })

  test("builds a user-facing guidance message that points at the dedicated config file", () => {
    expect(buildMissingConfigMessage(getPluginConfigPath())).toBe(
      `[cliproxyapi-sync] Sync skipped: fill ${getPluginConfigPath()}`,
    )
  })
})

function buildLegacySeedProvider() {
  return {
    name: "CLIProxyAPI",
    npm: "@ai-sdk/openai-compatible",
    options: {
      apiKey: "legacy-api-key",
      baseURL: "http://localhost:8317/v1",
      managementKey: "legacy-management-key",
    },
    models: {},
  }
}

async function writeTempOpenCodeConfig(config: unknown) {
  const filePath = getConfigPath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(config)}\n`, "utf8")
}

describe("loadSeedProviderState", () => {
  let tempDir = ""

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "cliproxyapi-state-"))
    process.env.OPENCODE_CONFIG_PATH = join(tempDir, ".config", "opencode", "opencode.json")
  })

  afterEach(async () => {
    delete process.env.OPENCODE_CONFIG_PATH
    await rm(tempDir, { force: true, recursive: true })
  })

  test("bootstraps the dedicated config file and returns a guidance message when no config exists", async () => {
    await writeTempOpenCodeConfig({ provider: {} })

    const result = await loadSeedProviderState({ provider: {} } as Config, null)

    expect(result.seedProvider).toBeNull()
    expect(result.message).toBe(`[cliproxyapi-sync] Sync skipped: fill ${getPluginConfigPath()}`)
    expect(await readFile(getPluginConfigPath(), "utf8")).toContain('"baseURL": "http://localhost:8317/v1"')
  })

  test("returns a seed provider from the dedicated config file", async () => {
    await writeTempOpenCodeConfig({ provider: {} })
    await mkdir(dirname(getPluginConfigPath()), { recursive: true })
    await writeFile(
      getPluginConfigPath(),
      `{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": "test-api-key",
  "managementKey": "secret"
}
`,
      "utf8",
    )

    const result = await loadSeedProviderState({ provider: {} } as Config, null)

    expect(result.message).toBeUndefined()
    expect(result.seedProvider).toEqual({
      name: "CLIProxyAPI",
      npm: "@ai-sdk/openai-compatible",
      options: {
        apiKey: "test-api-key",
        baseURL: "http://localhost:8317/v1",
        managementKey: "secret",
      },
      models: {},
    })
  })

  test("migrates a legacy seed provider into the dedicated config file and removes cliproxyapi from opencode.json", async () => {
    const runtimeConfig = { provider: { cliproxyapi: buildLegacySeedProvider() } } as Config
    await writeTempOpenCodeConfig(runtimeConfig)

    const result = await loadSeedProviderState(runtimeConfig, buildLegacySeedProvider())

    expect(result.seedProvider?.options).toEqual({
      apiKey: "legacy-api-key",
      baseURL: "http://localhost:8317/v1",
      managementKey: "legacy-management-key",
    })

    const pluginConfig = await readFile(getPluginConfigPath(), "utf8")
    expect(pluginConfig).toContain('"apiKey": "legacy-api-key"')
    expect(pluginConfig).toContain('"managementKey": "legacy-management-key"')

    const persisted = await readPersistedConfig()
    expect(persisted.provider?.cliproxyapi).toBeUndefined()
    expect(runtimeConfig.provider?.cliproxyapi).toBeUndefined()
  })

  test("removes the legacy seed provider when the dedicated config file already exists", async () => {
    const runtimeConfig = { provider: { cliproxyapi: buildLegacySeedProvider() } } as Config
    await writeTempOpenCodeConfig(runtimeConfig)
    await mkdir(dirname(getPluginConfigPath()), { recursive: true })
    await writeFile(
      getPluginConfigPath(),
      `{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": "new-api-key"
}
`,
      "utf8",
    )

    const result = await loadSeedProviderState(runtimeConfig, buildLegacySeedProvider())

    expect(result.seedProvider?.options).toEqual({
      apiKey: "new-api-key",
      baseURL: "http://localhost:8317/v1",
    })

    const persisted = await readPersistedConfig()
    expect(persisted.provider?.cliproxyapi).toBeUndefined()
    expect(runtimeConfig.provider?.cliproxyapi).toBeUndefined()
  })

  test("returns the guidance message when the dedicated config file is missing required values", async () => {
    await writeTempOpenCodeConfig({ provider: {} })
    await mkdir(dirname(getPluginConfigPath()), { recursive: true })
    await writeFile(
      getPluginConfigPath(),
      `{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": ""
}
`,
      "utf8",
    )

    const result = await loadSeedProviderState({ provider: {} } as Config, null)

    expect(result.seedProvider).toBeNull()
    expect(result.message).toBe(`[cliproxyapi-sync] Sync skipped: fill ${getPluginConfigPath()}`)
  })
})
