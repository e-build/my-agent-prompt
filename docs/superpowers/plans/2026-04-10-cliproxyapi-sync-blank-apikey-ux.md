# cliproxyapi-sync Blank apiKey UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cliproxyapi-sync`가 blank `apiKey`에서도 가능한 범위의 sync를 계속 시도하고, startup guidance/partial-sync 상태를 warning toast로 더 잘 드러내도록 만든다.

**Architecture:** `config.ts`는 blank `apiKey`를 허용하는 seed-provider state semantics를 담당하고, `core.ts`는 management/OAuth phase 와 API-key models phase 를 분리해 `/v1/models` 실패를 non-fatal 로 처리한다. plugin `config()` hook 은 sync 결과와 warning 상태를 함께 받아 success toast 또는 warning toast 를 지연 표시한다.

**Tech Stack:** TypeScript, Bun, Bun test, OpenCode plugin API, local TypeScript plugin entry

---

## File Map

- Modify: `opencode-plugins/cliproxyapi-sync/config.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/config.test.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/core.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`

## Constraints

- 현재 로컬 플러그인 엔트리 구조(`cliproxyapi-sync.ts -> ./core`)는 유지한다.
- 사용자가 명시적으로 요청하기 전에는 git commit 을 만들지 않는다.
- 사용자가 다시 요청하기 전에는 별도 worktree 를 만들지 않고 현재 작업공간에서 진행한다.
- `cp-*` provider 생성 규칙, metadata owner mapping, reasoning variant 규칙은 바꾸지 않는다.
- `cliproxyapi-sync-config.jsonc` 구조는 유지하고 `baseURL`, `apiKey`, `managementKey` 외 필드는 추가하지 않는다.

---

### Task 1: Relax config-state semantics for blank `apiKey`

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/config.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/config.test.ts`

- [ ] **Step 1: Write the failing config-state tests first**

Update `opencode-plugins/cliproxyapi-sync/config.test.ts` so the import block includes the new helper and the existing blank-`apiKey` test is replaced with these exact expectations:

```ts
import {
  buildMissingConfigMessage,
  buildPartialSyncMessage,
  ensureCliproxyapiConfigBootstrap,
  getConfigPath,
  getPluginConfigPath,
  loadSeedProviderState,
  loadPluginConfig,
  readPersistedConfig,
} from "./config"

test("returns a partial-sync seed provider when baseURL exists and apiKey is blank", async () => {
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

  expect(result).toEqual({
    seedProvider: {
      name: "CLIProxyAPI",
      npm: "@ai-sdk/openai-compatible",
      options: {
        apiKey: "",
        baseURL: "http://localhost:8317/v1",
      },
      models: {},
    },
    partialSync: true,
    pluginConfigPath: getPluginConfigPath(),
    message: buildPartialSyncMessage(getPluginConfigPath()),
  })
})

test("returns the guidance message when baseURL is missing", async () => {
  await writeTempOpenCodeConfig({ provider: {} })
  await mkdir(dirname(getPluginConfigPath()), { recursive: true })
  await writeFile(
    getPluginConfigPath(),
    `{
  "apiKey": "test-api-key"
}
`,
    "utf8",
  )

  const result = await loadSeedProviderState({ provider: {} } as Config, null)

  expect(result.seedProvider).toBeNull()
  expect(result.partialSync).toBe(false)
  expect(result.pluginConfigPath).toBe(getPluginConfigPath())
  expect(result.message).toBe(buildMissingConfigMessage(getPluginConfigPath()))
})
```

- [ ] **Step 2: Run the targeted tests and watch them fail for the right reason**

Run: `bun test config.test.ts --test-name-pattern "partial-sync seed provider|baseURL is missing"`

Expected: FAIL because `buildPartialSyncMessage` does not exist yet and `loadSeedProviderState()` still returns `seedProvider: null` when `apiKey` is blank.

- [ ] **Step 3: Implement the minimal config-state changes in `config.ts`**

Replace the existing `SeedProviderState` type and add the new helper in `opencode-plugins/cliproxyapi-sync/config.ts`:

```ts
export type SeedProviderState = {
  seedProvider: ProviderInfo | null
  message?: string
  partialSync: boolean
  pluginConfigPath: string
}

export function buildPartialSyncMessage(filePath = getPluginConfigPath()) {
  return `[cliproxyapi-sync] Partial sync enabled: fill ${filePath} to enable /v1/models sync.`
}
```

Then replace the `pluginConfig` branch inside `loadSeedProviderState()` with this exact block:

```ts
if (pluginConfig) {
  if (legacySeedProvider) {
    await removeLegacySeedProvider(runtimeConfig)
  }

  if (!pluginConfig.baseURL) {
    return {
      seedProvider: null,
      message: buildMissingConfigMessage(configPath),
      partialSync: false,
      pluginConfigPath: configPath,
    }
  }

  const seedProvider = buildSeedProviderFromPluginConfig(pluginConfig)
  const partialSync = !pluginConfig.apiKey

  return {
    seedProvider,
    partialSync,
    pluginConfigPath: configPath,
    ...(partialSync ? { message: buildPartialSyncMessage(configPath) } : {}),
  }
}
```

Finally, update the legacy-migration and bootstrap return values so they also include `partialSync` and `pluginConfigPath`:

```ts
return {
  seedProvider: buildSeedProviderFromPluginConfig((await loadPluginConfig(configPath))!),
  partialSync: false,
  pluginConfigPath: configPath,
}

return {
  seedProvider: null,
  message: buildMissingConfigMessage(configPath),
  partialSync: false,
  pluginConfigPath: configPath,
}
```

- [ ] **Step 4: Run the full config test file and make sure it passes**

Run: `bun test config.test.ts`

Expected: PASS with the new blank-`apiKey` partial-sync test green, the missing-`baseURL` guidance test green, and all prior config bootstrap/migration tests still passing.

---

### Task 2: Make `/v1/models` optional and non-fatal during sync

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/core.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`

- [ ] **Step 1: Write the failing runtime tests for blank-`apiKey` partial sync**

Add these tests to `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts` near the existing dedicated-config tests:

```ts
test("keeps OAuth sync running when apiKey is blank and /v1/models returns 401", async () => {
  await writeTempOpenCodeConfig({ provider: {} })
  await writeTempPluginConfig(`{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": ""
}
`)

  const logs: string[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)

    if (url.endsWith("/v0/management/auth-files")) {
      return new Response(
        JSON.stringify({
          files: [
            {
              name: "antigravity-test@example.com.json",
              provider: "antigravity",
              account_type: "oauth",
              disabled: false,
              status: "active",
            },
          ],
        }),
      )
    }

    if (url.includes("/v0/management/auth-files/models")) {
      return new Response(
        JSON.stringify({
          models: [{ id: "gemini-3-flash", owned_by: "antigravity", display_name: "Gemini 3 Flash", type: "antigravity" }],
        }),
      )
    }

    if (url === "http://localhost:8317/v1/models") {
      expect(init?.headers).toBeUndefined()
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401,
        statusText: "Unauthorized",
      })
    }

    if (url.endsWith("/v0/management/model-definitions/antigravity")) {
      return new Response(
        JSON.stringify({
          channel: "antigravity",
          models: [
            {
              id: "gemini-3-flash",
              display_name: "Gemini 3 Flash",
              thinking: { levels: ["minimal", "low", "medium", "high"] },
            },
          ],
        }),
      )
    }

    return new Response(JSON.stringify({ channel: url.split("/").at(-1), models: [] }))
  }

  const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
  const plugin = await CliproxyapiSyncPlugin({
    client: {
      app: {
        log: (input) => {
          logs.push(input.body.message)
          return Promise.resolve()
        },
      },
    },
  })
  const config = { provider: {} }

  await plugin.config(config)

  expect(config.provider?.["cp-antigravity"]?.models?.["gemini-3-flash"]).toBeDefined()
  expect(config.provider?.["cp-openai"]).toBeUndefined()
  expect(logs.some((line) => line.includes("Partial sync: API-key models skipped"))).toBe(true)
})

test("still performs full sync when apiKey is present", async () => {
  await writeTempOpenCodeConfig({ provider: {} })
  await writeTempPluginConfig(`{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": "test-api-key"
}
`)

  stubAntigravityModelFetch()
  const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
  const plugin = await CliproxyapiSyncPlugin({
    client: { app: { log: () => Promise.resolve() } },
  })
  const config = { provider: {} }

  await plugin.config(config)

  expect(config.provider?.["cp-antigravity"]?.models?.["gemini-3-flash"]).toBeDefined()
})
```

- [ ] **Step 2: Run the targeted runtime tests and confirm they fail first**

Run: `bun test cliproxyapi-sync.test.ts --test-name-pattern "keeps OAuth sync running when apiKey is blank|still performs full sync when apiKey is present"`

Expected: FAIL because `syncCliproxyapiProvider()` still returns early when `apiKey` is blank and `fetchModels()` still assumes a Bearer header is always required.

- [ ] **Step 3: Implement the two-phase sync flow in `core.ts`**

Add this new outcome type near the existing `SyncResult` type definitions in `opencode-plugins/cliproxyapi-sync/core.ts`:

```ts
type SyncOutcome = {
  result?: SyncResult
  warningMessage?: string
}
```

Replace `fetchModels()` with this version so blank `apiKey` omits `Authorization` entirely:

```ts
async function fetchModels(baseURL: string, apiKey: string) {
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
  const response = await fetch(`${normalizeBaseUrl(baseURL)}/models`, headers ? { headers } : undefined)

  if (!response.ok) {
    throw new Error(`Model fetch failed with ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as ModelResponse
}
```

Add this helper above `syncCliproxyapiProvider()`:

```ts
function buildApiKeyPhaseWarning(pluginConfigPath: string, reason: string) {
  return (
    `[cliproxyapi-sync] Partial sync: OAuth providers updated, API-key models skipped (${reason}). ` +
    `Fill ${pluginConfigPath} to enable /v1/models sync.`
  )
}
```

Then replace `syncCliproxyapiProvider()` with this implementation:

```ts
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
    const failure = error instanceof Error ? error.message : String(error)
    const skipMessage = `[cliproxyapi-sync] Sync skipped: ${failure}`
    await log(skipMessage)
    return { warningMessage: skipMessage }
  }
}
```

- [ ] **Step 4: Re-run the targeted runtime tests and make sure they pass**

Run: `bun test cliproxyapi-sync.test.ts --test-name-pattern "keeps OAuth sync running when apiKey is blank|still performs full sync when apiKey is present"`

Expected: PASS with the blank-`apiKey` case preserving `cp-antigravity` and the full-sync regression still green.

---

### Task 3: Surface guidance and partial-failure states through warning toasts

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/core.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`

- [ ] **Step 1: Write failing warning-toast tests before changing the toast code**

Add these tests to `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`:

```ts
test("shows a warning toast when blank apiKey forces partial sync", async () => {
  await writeTempOpenCodeConfig({ provider: {} })
  await writeTempPluginConfig(`{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": ""
}
`)

  globalThis.fetch = async (input) => {
    const url = String(input)

    if (url.endsWith("/v0/management/auth-files")) {
      return new Response(JSON.stringify({ files: [] }))
    }

    if (url === "http://localhost:8317/v1/models") {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401,
        statusText: "Unauthorized",
      })
    }

    return new Response(JSON.stringify({ channel: url.split("/").at(-1), models: [] }))
  }

  const toastCalls: unknown[] = []
  const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
  const plugin = await CliproxyapiSyncPlugin({
    client: {
      app: { log: () => Promise.resolve() },
      tui: {
        showToast: (input) => {
          toastCalls.push(input)
          return Promise.resolve(true)
        },
      },
    },
  })

  await plugin.config({ provider: {} })
  await new Promise((resolve) => setTimeout(resolve, 4000))

  expect(toastCalls).toEqual([
    {
      body: {
        title: "CLIProxyAPI Sync",
        message: expect.stringContaining("Fill "),
        variant: "warning",
        duration: 5000,
      },
    },
  ])
})

test("shows a warning toast when baseURL is missing and sync cannot start", async () => {
  await writeTempOpenCodeConfig({ provider: {} })
  await writeTempPluginConfig(`{
  "apiKey": "test-api-key"
}
`)

  let fetchCalled = false
  const toastCalls: unknown[] = []
  globalThis.fetch = async () => {
    fetchCalled = true
    return new Response(JSON.stringify({ data: [] }))
  }

  const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
  const plugin = await CliproxyapiSyncPlugin({
    client: {
      app: { log: () => Promise.resolve() },
      tui: {
        showToast: (input) => {
          toastCalls.push(input)
          return Promise.resolve(true)
        },
      },
    },
  })

  await plugin.config({ provider: {} })
  await new Promise((resolve) => setTimeout(resolve, 4000))

  expect(fetchCalled).toBe(false)
  expect(toastCalls).toEqual([
    {
      body: {
        title: "CLIProxyAPI Sync",
        message: `[cliproxyapi-sync] Sync skipped: fill ${getPluginConfigPath()}`,
        variant: "warning",
        duration: 5000,
      },
    },
  ])
})
```

- [ ] **Step 2: Run the warning-toast tests and confirm they fail first**

Run: `bun test cliproxyapi-sync.test.ts --test-name-pattern "warning toast when blank apiKey|warning toast when baseURL is missing"`

Expected: FAIL because the plugin currently only schedules success toasts and ignores the warning state returned from `syncCliproxyapiProvider()`.

- [ ] **Step 3: Add a generic toast helper and route warning states through it**

Replace `showSuccessToast()` in `opencode-plugins/cliproxyapi-sync/core.ts` with this generic helper:

```ts
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
```

Then replace the `config()` hook body with this exact block:

```ts
config: async (config) => {
  const outcome = await syncCliproxyapiProvider(config, log)
  if (!outcome) return

  const toast = outcome.warningMessage
    ? {
        message: outcome.warningMessage,
        variant: "warning" as const,
      }
    : outcome.result
      ? {
          message: formatSyncToastMessage(outcome.result),
          variant: "success" as const,
        }
      : undefined

  if (!toast) return

  setTimeout(() => showToast(client, toast.message, toast.variant), TOAST_DELAY_MS)
},
```

- [ ] **Step 4: Run the toast regressions and then the full package suite**

Run: `bun test cliproxyapi-sync.test.ts --test-name-pattern "warning toast when blank apiKey|warning toast when baseURL is missing"`

Expected: PASS with both warning-toast tests green.

Run: `bun test`

Expected: PASS with `config.test.ts` and `cliproxyapi-sync.test.ts` both green.

---

### Task 4: Final verification before handoff

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/config.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/config.test.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/core.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`

- [ ] **Step 1: Run the full package test suite from the plugin directory**

Run: `bun test`

Workdir: `/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync`

Expected: PASS with all config, sync, and toast tests green.

- [ ] **Step 2: Reproduce the real startup path with an explicit model override**

Run: `opencode run --print-logs --log-level DEBUG --model cp-github-copilot/claude-sonnet-4.6 "hello"`

Workdir: `/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt`

Expected: plugin load succeeds through `~/.config/opencode/plugins/cliproxyapi-sync.ts`; with blank `apiKey`, startup should no longer short-circuit before OAuth sync and should emit a partial-sync warning instead of the old hard skip behavior.

- [ ] **Step 3: Do not create a commit unless the user explicitly asks for one**

This repository rule overrides the generic planning template’s “frequent commits” advice.

---

## Self-Review Checklist

- Spec coverage: the plan covers blank-`apiKey` config semantics, non-fatal `/v1/models` handling, warning toast visibility, partial-sync logging, and runtime verification.
- Placeholder scan: no `TBD`, `TODO`, or vague “handle appropriately” instructions remain.
- Type consistency: all tasks use the same `SeedProviderState.partialSync`, `SeedProviderState.pluginConfigPath`, `buildPartialSyncMessage()`, and `SyncOutcome.warningMessage` names.
