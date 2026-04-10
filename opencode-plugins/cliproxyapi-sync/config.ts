import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir } from "node:os"

import type { Config } from "@opencode-ai/plugin"
import { parse } from "jsonc-parser"

const CONFIG_FILE_NAME = "cliproxyapi-sync-config.jsonc"
const DEFAULT_CONFIG_TEMPLATE = `{
  // CLI Proxy API base URL, usually ending with /v1
  "baseURL": "http://localhost:8317/v1",

  // API key used for /v1/models
  "apiKey": "",

  // Optional. If omitted, plugin falls back to its default management key.
  "managementKey": ""
}
`

export type PluginConfig = {
  baseURL?: string
  apiKey?: string
  managementKey?: string
}

type ProviderRecord = NonNullable<Config["provider"]>
type ProviderInfo = ProviderRecord[string]
type PersistedConfig = Record<string, unknown> & {
  provider?: Config["provider"]
}

export type SeedProviderState = {
  seedProvider: ProviderInfo | null
  partialSync: boolean
  pluginConfigPath: string
  message?: string
}

export function getConfigPath() {
  return process.env.OPENCODE_CONFIG_PATH || join(homedir(), ".config", "opencode", "opencode.json")
}

export function getPluginConfigPath() {
  return join(dirname(getConfigPath()), CONFIG_FILE_NAME)
}

export function buildMissingConfigMessage(filePath = getPluginConfigPath()) {
  return `[cliproxyapi-sync] Sync skipped: fill ${filePath}`
}

export function buildPartialSyncMessage(filePath = getPluginConfigPath()) {
  return `[cliproxyapi-sync] Partial sync: fill apiKey in ${filePath} to include API-key models`
}

export async function ensureCliproxyapiConfigBootstrap(filePath = getPluginConfigPath()): Promise<void> {
  try {
    await writeFile(filePath, DEFAULT_CONFIG_TEMPLATE, {
      encoding: "utf8",
      flag: "wx",
    })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code

    if (code === "ENOENT") {
      await mkdir(dirname(filePath), { recursive: true })
      await ensureCliproxyapiConfigBootstrap(filePath)
      return
    }

    if (code === "EEXIST") {
      return
    }

    throw error
  }
}

export async function loadPluginConfig(filePath = getPluginConfigPath()): Promise<PluginConfig | undefined> {
  try {
    const text = await readFile(filePath, "utf8")
    const parsed = parse(text)

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("cliproxyapi-sync config root must be an object")
    }

    return {
      baseURL: typeof parsed.baseURL === "string" ? parsed.baseURL : undefined,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : undefined,
      managementKey: typeof parsed.managementKey === "string" ? parsed.managementKey : undefined,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

export async function readPersistedConfig(): Promise<PersistedConfig> {
  const content = await readFile(getConfigPath(), "utf8")
  const parsed = JSON.parse(content)

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Persisted config root must be an object")
  }

  return parsed as PersistedConfig
}

export async function writeConfigAtomically(config: PersistedConfig): Promise<void> {
  const nextContent = `${JSON.stringify(config, null, 2)}\n`
  const configPath = getConfigPath()
  const tempPath = `${configPath}.tmp`
  await writeFile(tempPath, nextContent, "utf8")
  await rename(tempPath, configPath)
}

function buildSeedProviderFromPluginConfig(pluginConfig: PluginConfig): ProviderInfo {
  const options: Record<string, string> = {
    apiKey: pluginConfig.apiKey ?? "",
    baseURL: pluginConfig.baseURL ?? "",
  }

  if (pluginConfig.managementKey) {
    options.managementKey = pluginConfig.managementKey
  }

  return {
    name: "CLIProxyAPI",
    npm: "@ai-sdk/openai-compatible",
    options,
    models: {},
  }
}

function buildPluginConfigContent(pluginConfig: PluginConfig) {
  return `{
  // CLI Proxy API base URL, usually ending with /v1
  "baseURL": ${JSON.stringify(pluginConfig.baseURL ?? "http://localhost:8317/v1")},

  // API key used for /v1/models
  "apiKey": ${JSON.stringify(pluginConfig.apiKey ?? "")},

  // Optional. If omitted, plugin falls back to its default management key.
  "managementKey": ${JSON.stringify(pluginConfig.managementKey ?? "")}
}
`
}

async function writePluginConfigFromLegacy(provider: ProviderInfo, filePath = getPluginConfigPath()): Promise<void> {
  const options = provider?.options && typeof provider.options === "object" ? provider.options : {}

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(
    filePath,
    buildPluginConfigContent({
      baseURL: typeof options.baseURL === "string" ? options.baseURL : undefined,
      apiKey: typeof options.apiKey === "string" ? options.apiKey : undefined,
      managementKey:
        typeof options.managementKey === "string"
          ? options.managementKey
          : typeof options.management_key === "string"
            ? options.management_key
            : undefined,
    }),
    {
      encoding: "utf8",
      flag: "wx",
    },
  )
}

async function removeLegacySeedProvider(runtimeConfig: Config): Promise<void> {
  const persisted = await readPersistedConfig()

  if (persisted.provider && typeof persisted.provider === "object") {
    delete persisted.provider.cliproxyapi
  }

  if (runtimeConfig.provider && typeof runtimeConfig.provider === "object") {
    delete runtimeConfig.provider.cliproxyapi
  }

  await writeConfigAtomically(persisted)
}

export async function loadSeedProviderState(
  runtimeConfig: Config,
  legacySeedProvider: ProviderInfo | null,
): Promise<SeedProviderState> {
  const configPath = getPluginConfigPath()
  const pluginConfig = await loadPluginConfig(configPath)

  if (pluginConfig) {
    if (legacySeedProvider) {
      await removeLegacySeedProvider(runtimeConfig)
    }

    if (!pluginConfig.baseURL) {
      return {
        seedProvider: null,
        partialSync: false,
        pluginConfigPath: configPath,
        message: buildMissingConfigMessage(configPath),
      }
    }

    if (!pluginConfig.apiKey) {
      return {
        seedProvider: buildSeedProviderFromPluginConfig(pluginConfig),
        partialSync: true,
        pluginConfigPath: configPath,
        message: buildPartialSyncMessage(configPath),
      }
    }

    return {
      seedProvider: buildSeedProviderFromPluginConfig(pluginConfig),
      partialSync: false,
      pluginConfigPath: configPath,
    }
  }

  if (legacySeedProvider) {
    await writePluginConfigFromLegacy(legacySeedProvider, configPath)
    await removeLegacySeedProvider(runtimeConfig)

    return {
      seedProvider: buildSeedProviderFromPluginConfig((await loadPluginConfig(configPath))!),
      partialSync: false,
      pluginConfigPath: configPath,
    }
  }

  await ensureCliproxyapiConfigBootstrap(configPath)

  return {
    seedProvider: null,
    partialSync: false,
    pluginConfigPath: configPath,
    message: buildMissingConfigMessage(configPath),
  }
}
