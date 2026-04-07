// @ts-nocheck
import fs from "fs/promises"
import os from "os"
import path from "path"

import type { Config, Plugin } from "@opencode-ai/plugin"

type ModelResponse = {
  data?: Array<{
    id?: string
    owned_by?: string
  }>
}

type ManagementModelDefinitionsResponse = {
  channel?: string
  models?: ManagementModelDefinition[]
}

type ManagementModelDefinition = {
  id?: string
  display_name?: string
  thinking?: {
    levels?: unknown
  }
}

type ManagedModel = {
  name: string
  variants?: Record<
    string,
    {
      reasoningEffort: string
      reasoningSummary: "auto"
      include: string[]
    }
  >
}

type ManagedModelsByOwner = Record<string, Record<string, ManagedModel>>

type ModelMetadataByOwner = Record<
  string,
  Record<
    string,
    {
      displayName?: string
      thinkingLevels?: string[]
    }
  >
>

type ProviderRecord = NonNullable<Config["provider"]>
type ProviderInfo = ProviderRecord[string]
type PersistedConfig = Record<string, unknown> & {
  provider?: Config["provider"]
}

type NextProviderState = {
  config: PersistedConfig
  provider: Config["provider"]
  changed: boolean
}

const CONFIG_PATH = path.join(os.homedir(), ".config", "opencode", "opencode.json")
const DEFAULT_MANAGEMENT_KEY = "1234qwer!"
const COPILOT_REASONING_INCLUDE = ["reasoning.encrypted_content"]
const COPILOT_REASONING_VARIANTS = new Set(["low", "medium", "high", "xhigh"])
const METADATA_CHANNEL_OWNER_MAP = {
  "github-copilot": "github-copilot",
  codex: "openai",
} as const

function normalizeBaseUrl(baseURL: string) {
  return baseURL.replace(/\/+$/, "")
}

function normalizeOwner(owner: string) {
  return owner
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
}

function buildProviderId(owner: string) {
  return `cp-${normalizeOwner(owner)}`
}

function buildProviderName(owner: string) {
  const titleCasedOwner = owner
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")

  return `CP ${titleCasedOwner}`
}

function isProviderRecord(value: unknown): value is ProviderRecord {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function buildModelsByOwner(
  payload: ModelResponse,
  metadataByOwner: ModelMetadataByOwner = {},
): ManagedModelsByOwner {
  const groups = new Map<string, Set<string>>()

  for (const model of payload.data ?? []) {
    if (typeof model.id !== "string" || model.id.length === 0) continue
    if (typeof model.owned_by !== "string" || model.owned_by.length === 0) continue

    const existing = groups.get(model.owned_by) ?? new Set<string>()
    existing.add(model.id)
    groups.set(model.owned_by, existing)
  }

  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([owner, ids]) => {
        const models = Object.fromEntries(
          [...ids]
            .sort((left, right) => left.localeCompare(right))
            .map((id) => [id, buildManagedModel(owner, id, metadataByOwner[owner]?.[id])]),
        )

        return [owner, models]
      }),
  )
}

function buildManagedModel(
  owner: string,
  id: string,
  metadata?: {
    displayName?: string
    thinkingLevels?: string[]
  },
): ManagedModel {
  const variants = buildVariants(owner, metadata?.thinkingLevels)
  return {
    name: metadata?.displayName || id,
    ...(variants ? { variants } : {}),
  }
}

function buildVariants(owner: string, thinkingLevels: string[] | undefined) {
  const normalizedOwner = normalizeOwner(owner)
  if (normalizedOwner !== "github-copilot" && normalizedOwner !== "openai") return undefined
  if (!thinkingLevels?.length) return undefined

  const entries = thinkingLevels
    .filter((level) => COPILOT_REASONING_VARIANTS.has(level))
    .map((level) => [
      level,
      {
        reasoningEffort: level,
        reasoningSummary: "auto" as const,
        include: COPILOT_REASONING_INCLUDE,
      },
    ])

  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

function buildManagementBaseUrl(baseURL: string) {
  return normalizeBaseUrl(baseURL).replace(/\/v1$/, "")
}

function resolveManagementKey(options: ProviderInfo["options"]) {
  if (!options || typeof options !== "object") return DEFAULT_MANAGEMENT_KEY

  const configuredKey =
    typeof options.managementKey === "string"
      ? options.managementKey
      : typeof options.management_key === "string"
        ? options.management_key
        : undefined

  return configuredKey || DEFAULT_MANAGEMENT_KEY
}

function stripManagementKey(options: ProviderInfo["options"]) {
  if (!options || typeof options !== "object") return options

  const { managementKey: _managementKey, management_key: _management_key, ...rest } = options as Record<string, unknown>
  return rest
}

function normalizeThinkingLevels(levels: unknown) {
  if (!Array.isArray(levels)) return undefined

  const normalized = levels.filter((level): level is string => typeof level === "string" && level.length > 0)
  return normalized.length > 0 ? normalized : undefined
}

function buildMetadataByOwner(payloads: ManagementModelDefinitionsResponse[]): ModelMetadataByOwner {
  const byOwner: ModelMetadataByOwner = {}

  for (const payload of payloads) {
    for (const model of payload.models ?? []) {
      if (typeof model.id !== "string" || model.id.length === 0) continue

      const owner = payload.channel ? METADATA_CHANNEL_OWNER_MAP[payload.channel as keyof typeof METADATA_CHANNEL_OWNER_MAP] : undefined
      if (!owner) continue

      byOwner[owner] ??= {}
      byOwner[owner][model.id] = {
        displayName: typeof model.display_name === "string" && model.display_name.length > 0 ? model.display_name : undefined,
        thinkingLevels: normalizeThinkingLevels(model.thinking?.levels),
      }
    }
  }

  return byOwner
}

function resolveSeedProvider(config: Config) {
  const cliproxyapi = config.provider?.cliproxyapi
  if (cliproxyapi && typeof cliproxyapi === "object") {
    return cliproxyapi
  }

  const openai = config.provider?.["cp-openai"]
  if (openai && typeof openai === "object") {
    return openai
  }

  return null
}

export function buildManagedProviders(seedProvider: ProviderInfo, modelsByOwner: ManagedModelsByOwner) {
  return Object.fromEntries(
    Object.entries(modelsByOwner).map(([owner, models]) => [
      buildProviderId(owner),
      {
        ...seedProvider,
        name: buildProviderName(owner),
        options: {
          ...stripManagementKey(seedProvider.options),
        },
        models,
      },
    ]),
  )
}

async function fetchMetadataByOwner(baseURL: string, managementKey: string, log: (message: string) => Promise<void>) {
  const metadataPayloads: ManagementModelDefinitionsResponse[] = []

  for (const channel of ["github-copilot", "codex"]) {
    try {
      metadataPayloads.push(await fetchModelDefinitions(baseURL, managementKey, channel))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await log(`[cliproxyapi-sync] Metadata sync skipped for ${channel}: ${message}`)
    }
  }

  return buildMetadataByOwner(metadataPayloads)
}

function stableStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function getPersistedProviders(config: PersistedConfig): ProviderRecord {
  return isProviderRecord(config.provider) ? config.provider : {}
}

function isManagedProviderId(id: string) {
  return id.startsWith("cp-")
}

export function buildNextProviderState(
  persistedConfig: PersistedConfig,
  managedProviders: Config["provider"],
): NextProviderState {
  const persistedProviders = getPersistedProviders(persistedConfig)
  const unmanagedProviders = Object.fromEntries(
    Object.entries(persistedProviders).filter(([id]) => !isManagedProviderId(id)),
  )
  const nextProvider = {
    ...unmanagedProviders,
    ...managedProviders,
  }

  return {
    config: {
      ...persistedConfig,
      provider: nextProvider,
    },
    provider: nextProvider,
    changed: stableStringify(nextProvider) !== stableStringify(persistedProviders),
  }
}

async function writeConfigAtomically(config: Config) {
  const nextContent = `${stableStringify(config)}\n`
  const tempPath = `${CONFIG_PATH}.tmp`
  await fs.writeFile(tempPath, nextContent, "utf8")
  await fs.rename(tempPath, CONFIG_PATH)
}

async function readPersistedConfig() {
  const content = await fs.readFile(CONFIG_PATH, "utf8")
  const parsed = JSON.parse(content)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Persisted config root must be an object")
  }

  return parsed as PersistedConfig
}

async function fetchModels(baseURL: string, apiKey: string) {
  const response = await fetch(`${normalizeBaseUrl(baseURL)}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Model fetch failed with ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as ModelResponse
}

async function fetchModelDefinitions(baseURL: string, managementKey: string, channel: string) {
  const response = await fetch(`${buildManagementBaseUrl(baseURL)}/v0/management/model-definitions/${channel}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Model definitions fetch failed with ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as ManagementModelDefinitionsResponse
}

async function syncCliproxyapiProvider(config: Config, log: (message: string) => Promise<void>) {
  const seedProvider = resolveSeedProvider(config)
  if (!seedProvider) return

  const options = seedProvider.options
  if (!options || typeof options !== "object") return

  const baseURL = typeof options.baseURL === "string" ? options.baseURL : ""
  const apiKey = typeof options.apiKey === "string" ? options.apiKey : ""
  const managementKey = resolveManagementKey(options)
  if (!baseURL || !apiKey) return

  try {
    const payload = await fetchModels(baseURL, apiKey)
    const metadataByOwner = await fetchMetadataByOwner(baseURL, managementKey, log)

    const modelsByOwner = buildModelsByOwner(payload, metadataByOwner)
    const managedProviders = buildManagedProviders(
      {
        ...seedProvider,
        options: {
          ...options,
          baseURL,
          apiKey,
        },
      },
      modelsByOwner,
    )

    const persistedConfig = await readPersistedConfig()
    const nextState = buildNextProviderState(persistedConfig, managedProviders)
    if (!nextState.changed) {
      await log("[cliproxyapi-sync] cp-* providers already up to date")
      return
    }

    await writeConfigAtomically(nextState.config as Config)
    config.provider = nextState.provider
    await log(
      `[cliproxyapi-sync] Synced ${Object.keys(managedProviders ?? {}).length} providers from ${payload.data?.length ?? 0} models`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await log(`[cliproxyapi-sync] Sync skipped: ${message}`)
  }
}

export const CliproxyapiSyncPlugin: Plugin = async ({ client }) => {
  const log = async (message: string) => {
    console.log(message)
    await client.app.log({
      body: {
        service: "cliproxyapi-sync",
        level: "info",
        message,
      },
    }).catch(() => {})
  }

  return {
    config: async (config) => {
      await syncCliproxyapiProvider(config, log)
    },
  }
}
