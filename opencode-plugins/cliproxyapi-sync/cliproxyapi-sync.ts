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

type Variant = {
  reasoningEffort: string
  reasoningSummary?: "auto"
  include?: string[]
}

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

const DEFAULT_MANAGEMENT_KEY = "1234qwer!"
const COPILOT_REASONING_INCLUDE = ["reasoning.encrypted_content"]
const REASONING_VARIANTS = new Set(["auto", "minimal", "low", "medium", "high", "xhigh", "max"])
const METADATA_CHANNEL_OWNER_MAP = {
  codex: "openai",
} as const
const METADATA_CHANNELS = [
  "github-copilot",
  "codex",
  "antigravity",
  "claude",
  "gemini",
  "vertex",
  "gemini-cli",
  "aistudio",
  "qwen",
  "iflow",
  "kimi",
  "kiro",
  "kilo",
  "amazonq",
]

function normalizeBaseUrl(baseURL: string) {
  return baseURL.replace(/\/+$/, "")
}

export function getConfigPath() {
  return process.env.OPENCODE_CONFIG_PATH || path.join(os.homedir(), ".config", "opencode", "opencode.json")
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
  if (!thinkingLevels?.length) return undefined
  const normalizedOwner = normalizeOwner(owner)
  const shouldIncludeCopilotOptions = normalizedOwner === "github-copilot" || normalizedOwner === "openai"

  const entries = thinkingLevels
    .filter((level) => REASONING_VARIANTS.has(level))
    .map((level) => [
      level,
      {
        reasoningEffort: level,
        ...(shouldIncludeCopilotOptions
          ? {
              reasoningSummary: "auto" as const,
              include: COPILOT_REASONING_INCLUDE,
            }
          : {}),
      } satisfies Variant,
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

function buildMetadataByOwner(payloads: ManagementModelDefinitionsResponse[], modelsPayload?: ModelResponse): ModelMetadataByOwner {
  const byOwner: ModelMetadataByOwner = {}
  const ownersByModel = buildOwnersByModel(modelsPayload)

  for (const payload of payloads) {
    for (const model of payload.models ?? []) {
      if (typeof model.id !== "string" || model.id.length === 0) continue

      const owners = resolveMetadataOwners(payload.channel, model.id, ownersByModel)
      if (owners.length === 0) continue

      for (const owner of owners) {
        byOwner[owner] ??= {}
        byOwner[owner][model.id] = {
          displayName: typeof model.display_name === "string" && model.display_name.length > 0 ? model.display_name : undefined,
          thinkingLevels: normalizeThinkingLevels(model.thinking?.levels),
        }
      }
    }
  }

  return byOwner
}

function buildOwnersByModel(payload: ModelResponse | undefined) {
  const ownersByModel = new Map<string, Set<string>>()

  for (const model of payload?.data ?? []) {
    if (typeof model.id !== "string" || model.id.length === 0) continue
    if (typeof model.owned_by !== "string" || model.owned_by.length === 0) continue

    const owners = ownersByModel.get(model.id) ?? new Set<string>()
    owners.add(model.owned_by)
    ownersByModel.set(model.id, owners)
  }

  return ownersByModel
}

function resolveMetadataOwners(channel: string | undefined, modelId: string, ownersByModel: Map<string, Set<string>>) {
  if (!channel) return []

  const mappedOwner = METADATA_CHANNEL_OWNER_MAP[channel as keyof typeof METADATA_CHANNEL_OWNER_MAP]
  if (mappedOwner) return [mappedOwner]

  const matchingOwners = ownersByModel.get(modelId)
  if (matchingOwners?.has(channel)) return [channel]

  return []
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

async function fetchMetadataByOwner(
  baseURL: string,
  managementKey: string,
  modelsPayload: ModelResponse,
  log: (message: string) => Promise<void>,
) {
  const metadataPayloads: ManagementModelDefinitionsResponse[] = []

  for (const channel of METADATA_CHANNELS) {
    try {
      metadataPayloads.push(await fetchModelDefinitions(baseURL, managementKey, channel))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await log(`[cliproxyapi-sync] Metadata sync skipped for ${channel}: ${message}`)
    }
  }

  return buildMetadataByOwner(metadataPayloads, modelsPayload)
}

function stableStringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function getPersistedProviders(config: PersistedConfig): ProviderRecord {
  return isProviderRecord(config.provider) ? config.provider : {}
}

function sanitizePersistedProvider(provider: ProviderInfo): ProviderInfo {
  if (!provider || typeof provider !== "object") return provider

  return {
    ...provider,
    options: stripManagementKey(provider.options),
  }
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
    Object.entries(persistedProviders)
      .filter(([id]) => !isManagedProviderId(id))
      .map(([id, provider]) => [id, sanitizePersistedProvider(provider)]),
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
  const configPath = getConfigPath()
  const tempPath = `${configPath}.tmp`
  await fs.writeFile(tempPath, nextContent, "utf8")
  await fs.rename(tempPath, configPath)
}

async function readPersistedConfig() {
  const content = await fs.readFile(getConfigPath(), "utf8")
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
    const metadataByOwner = await fetchMetadataByOwner(baseURL, managementKey, payload, log)

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
