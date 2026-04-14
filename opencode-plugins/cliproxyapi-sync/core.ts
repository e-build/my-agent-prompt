// @ts-nocheck
import type { Config, Plugin } from "@opencode-ai/plugin"

import { loadSeedProviderState, readPersistedConfig, writeConfigAtomically } from "./config"

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

type SyncResult = {
  changed: boolean
  providerCount: number
  modelCount: number
  addedProviders: string[]
  addedModels: string[]
}

type SyncOutcome = {
  result?: SyncResult
  warningMessage?: string
}

type AuthFile = {
  name: string
  provider: string
  account_type: string
  disabled?: boolean
  status: string
}

type AuthFilesResponse = {
  files?: AuthFile[]
}

type AuthFileModelsResponse = {
  models?: Array<{
    id?: string
    display_name?: string
    owned_by?: string
    type?: string
  }>
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

// Owners that are exclusively served via OAuth auth-files.
// v1/models entries with these owners are excluded from API-key model discovery.
const KNOWN_OAUTH_OWNERS: ReadonlySet<string> = new Set([
  ...METADATA_CHANNELS,
  ...Object.values(METADATA_CHANNEL_OWNER_MAP),
])

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

function buildOwnedModelId(owner: string, id: string) {
  return `${owner}/${id}`
}

function stripOwnedModelPrefix(owner: string, id: string) {
  const prefix = `${owner}/`
  return id.startsWith(prefix) ? id.slice(prefix.length) : id
}

function formatManagedModelId(providerId: string, modelId: string) {
  const owner = providerId.startsWith("cp-") ? providerId.slice(3) : ""
  const visibleModelId = owner ? stripOwnedModelPrefix(owner, modelId) : modelId
  return `${providerId}/${visibleModelId}`
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
    existing.add(stripOwnedModelPrefix(model.owned_by, model.id))
    groups.set(model.owned_by, existing)
  }

  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([owner, ids]) => {
        const models = Object.fromEntries(
          [...ids]
            .sort((left, right) => left.localeCompare(right))
            .map((id) => {
              const metadata = metadataByOwner[owner]?.[id] ?? metadataByOwner[owner]?.[buildOwnedModelId(owner, id)]
              return [id, buildManagedModel(owner, id, metadata)]
            }),
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
    name: buildOwnedModelId(owner, id),
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
        const metadata = {
          displayName: typeof model.display_name === "string" && model.display_name.length > 0 ? model.display_name : undefined,
          thinkingLevels: normalizeThinkingLevels(model.thinking?.levels),
        }

        byOwner[owner][model.id] = metadata
        byOwner[owner][buildOwnedModelId(owner, model.id)] = metadata
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

    const rawId = stripOwnedModelPrefix(model.owned_by, model.id)

    const owners = ownersByModel.get(model.id) ?? new Set<string>()
    owners.add(model.owned_by)
    ownersByModel.set(model.id, owners)

    const ownersByRawId = ownersByModel.get(rawId) ?? new Set<string>()
    ownersByRawId.add(model.owned_by)
    ownersByModel.set(rawId, ownersByRawId)

    const ownedId = buildOwnedModelId(model.owned_by, rawId)
    const ownersByOwnedId = ownersByModel.get(ownedId) ?? new Set<string>()
    ownersByOwnedId.add(model.owned_by)
    ownersByModel.set(ownedId, ownersByOwnedId)
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

export function resolveSeedProvider(config: Config) {
  const cliproxyapi = config.provider?.cliproxyapi
  if (cliproxyapi && typeof cliproxyapi === "object") {
    return cliproxyapi
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

function getModelIds(provider: ProviderInfo) {
  if (!provider || typeof provider !== "object" || !provider.models || typeof provider.models !== "object") return []

  return Object.keys(provider.models)
}

function buildSyncResult(persistedProviders: ProviderRecord, managedProviders: Config["provider"], changed: boolean): SyncResult {
  const managedEntries = Object.entries(managedProviders ?? {})
  const addedProviders = managedEntries.filter(([id]) => !persistedProviders[id]).map(([id]) => id)
  const addedModels = managedEntries.flatMap(([providerId, provider]) => {
    const persistedModels = new Set(getModelIds(persistedProviders[providerId]))
    return getModelIds(provider)
      .filter((modelId) => !persistedModels.has(modelId))
      .map((modelId) => formatManagedModelId(providerId, modelId))
  })

  return {
    changed,
    providerCount: managedEntries.length,
    modelCount: managedEntries.reduce((count, [, provider]) => count + getModelIds(provider).length, 0),
    addedProviders,
    addedModels,
  }
}

async function fetchModels(baseURL: string, apiKey: string) {
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
  const response = await fetch(`${normalizeBaseUrl(baseURL)}/models`, headers ? { headers } : undefined)

  if (!response.ok) {
    throw new Error(`Model fetch failed with ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as ModelResponse
}

function buildApiKeyPhaseWarning(pluginConfigPath: string, reason: string) {
  return (
    `[cliproxyapi-sync] Partial sync: API-key models skipped (${reason}). ` +
    `Fill ${pluginConfigPath} to enable /v1/models sync.`
  )
}

async function fetchAuthFiles(baseURL: string, managementKey: string): Promise<AuthFilesResponse> {
  const response = await fetch(`${buildManagementBaseUrl(baseURL)}/v0/management/auth-files`, {
    headers: { Authorization: `Bearer ${managementKey}` },
  })
  if (!response.ok) {
    throw new Error(`Auth files fetch failed with ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as AuthFilesResponse
}

async function fetchAuthFileModels(
  baseURL: string,
  managementKey: string,
  authFileName: string,
): Promise<AuthFileModelsResponse> {
  const encoded = encodeURIComponent(authFileName)
  const response = await fetch(
    `${buildManagementBaseUrl(baseURL)}/v0/management/auth-files/models?name=${encoded}`,
    { headers: { Authorization: `Bearer ${managementKey}` } },
  )
  if (!response.ok) {
    throw new Error(`Auth file models fetch failed with ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as AuthFileModelsResponse
}

export function filterApiKeyModels(payload: ModelResponse): ModelResponse {
  return {
    ...payload,
    data: (payload.data ?? []).filter((model) => {
      if (typeof model.id !== "string" || model.id.length === 0) return false
      if (typeof model.owned_by !== "string" || model.owned_by.length === 0) return false
      if (KNOWN_OAUTH_OWNERS.has(model.owned_by)) return false

      return model.id.startsWith(`${model.owned_by}/`)
    }),
  }
}

export function normalizeAuthFileModels(responses: AuthFileModelsResponse[]): ModelResponse {
  const data = responses.flatMap((resp) =>
    (resp.models ?? [])
      .filter(
        (m) =>
          typeof m.id === "string" && m.id.length > 0 && typeof m.owned_by === "string" && m.owned_by.length > 0,
      )
      .map((m) => ({ id: stripOwnedModelPrefix(m.owned_by!, m.id!), owned_by: m.owned_by! })),
  )
  return { data }
}

async function fetchOAuthModels(
  baseURL: string,
  managementKey: string,
  log: (message: string) => Promise<void>,
): Promise<ModelResponse> {
  const authFiles = await fetchAuthFiles(baseURL, managementKey)
  const oauthEntries = (authFiles.files ?? []).filter((f) => f.account_type === "oauth" && f.disabled !== true)
  const responses: AuthFileModelsResponse[] = []

  for (const entry of oauthEntries) {
    try {
      const models = await fetchAuthFileModels(baseURL, managementKey, entry.name)
      responses.push(models)
      await log(`[cliproxyapi-sync] OAuth models loaded: ${entry.provider} (${models.models?.length ?? 0} models)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await log(`[cliproxyapi-sync] OAuth models skipped for ${entry.provider}: ${message}`)
    }
  }

  return normalizeAuthFileModels(responses)
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

async function syncCliproxyapiProvider(config: Config, log: (message: string) => Promise<void>): Promise<SyncOutcome | undefined> {
  const { seedProvider, message, partialSync, pluginConfigPath } = await loadSeedProviderState(
    config,
    resolveSeedProvider(config),
  )

  if (!seedProvider) {
    if (message) {
      await log(message)
      return { warningMessage: message }
    }

    return undefined
  }

  const options = seedProvider.options
  if (!options || typeof options !== "object") return undefined

  const baseURL = typeof options.baseURL === "string" ? options.baseURL : ""
  const apiKey = typeof options.apiKey === "string" ? options.apiKey : ""
  const managementKey = resolveManagementKey(options)
  if (!baseURL) {
    if (message) {
      await log(message)
      return { warningMessage: message }
    }

    return undefined
  }

  let warningMessage = partialSync ? message : undefined

  try {
    const oauthModels = await fetchOAuthModels(baseURL, managementKey, log)

    let apiKeyModels: ModelResponse = { data: [] }
    try {
      const allModels = await fetchModels(baseURL, apiKey)
      apiKeyModels = filterApiKeyModels(allModels)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)

       if (!partialSync) {
         throw error
       }

      warningMessage = buildApiKeyPhaseWarning(pluginConfigPath, reason)
      await log(warningMessage)
    }

    const mergedPayload: ModelResponse = {
      data: [...(oauthModels.data ?? []), ...(apiKeyModels.data ?? [])],
    }

    const metadataByOwner = await fetchMetadataByOwner(baseURL, managementKey, mergedPayload, log)

    const modelsByOwner = buildModelsByOwner(mergedPayload, metadataByOwner)
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
    const persistedProviders = getPersistedProviders(persistedConfig)
    const nextState = buildNextProviderState(persistedConfig, managedProviders)
    const result = buildSyncResult(persistedProviders, managedProviders, nextState.changed)

    if (!nextState.changed) {
      if (!warningMessage) {
        await log("[cliproxyapi-sync] cp-* providers already up to date")
      }

      return {
        result,
        ...(warningMessage ? { warningMessage } : {}),
      }
    }

    await writeConfigAtomically(nextState.config)
    config.provider = nextState.provider
    await log(
      `[cliproxyapi-sync] Synced ${Object.keys(managedProviders ?? {}).length} providers ` +
        `(${oauthModels.data?.length ?? 0} OAuth + ${apiKeyModels.data?.length ?? 0} API-key models)`,
    )

    return {
      result,
      ...(warningMessage ? { warningMessage } : {}),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await log(`[cliproxyapi-sync] Sync skipped: ${message}`)
    return { warningMessage: `[cliproxyapi-sync] Sync skipped: ${message}` }
  }
}

function formatAddedItems(label: string, items: string[]) {
  if (items.length === 0) return undefined
  const visibleItems = items.slice(0, 3)
  const suffix = items.length > visibleItems.length ? `, +${items.length - visibleItems.length} more` : ""
  return `${label} ${visibleItems.join(", ")}${suffix}`
}

function formatSyncToastMessage(result: SyncResult) {
  const status = result.changed ? "updated" : "up to date"
  const additions = [
    formatAddedItems("provider", result.addedProviders),
    formatAddedItems("model", result.addedModels),
  ].filter(Boolean)
  const base = `CLIProxyAPI sync ${status}: ${result.providerCount} providers, ${result.modelCount} models`

  return additions.length > 0 ? `${base}. Added ${additions.join(", ")}` : base
}

function showToast(
  client: Parameters<Plugin>[0]["client"],
  message: string,
  variant: "success" | "warning",
) {
  try {
    client.tui?.showToast({
      body: {
        title: "CLIProxyAPI Sync",
        message,
        variant,
        duration: 5000,
      },
    }).catch(() => {})
  } catch {
    // Toast availability should never affect startup sync.
  }
}

const TOAST_DELAY_MS = 3000

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
      const outcome = await syncCliproxyapiProvider(config, log)
      if (!outcome) return

      if (outcome.warningMessage) {
        setTimeout(() => showToast(client, outcome.warningMessage!, "warning"), TOAST_DELAY_MS)
        return
      }

      if (!outcome.result) return

      const message = formatSyncToastMessage(outcome.result)
      setTimeout(() => showToast(client, message, "success"), TOAST_DELAY_MS)
    },
  }
}
