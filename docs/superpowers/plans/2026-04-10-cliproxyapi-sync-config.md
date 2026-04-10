# cliproxyapi-sync Config UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cliproxyapi-sync`를 `provider.cliproxyapi` seed provider 의존성에서 분리하고, `~/.config/opencode/cliproxyapi-sync-config.jsonc` 기반 bootstrap + migration UX로 전환한다.

**Architecture:** 새 `config.ts` 모듈이 OpenCode config 경로 계산, 전용 `jsonc` bootstrap, legacy `provider.cliproxyapi` 마이그레이션, seed provider adapter 를 전담한다. `core.ts`의 모델 sync 로직은 유지하고, sync 진입 전에 `config.ts`가 반환한 seed provider state 만 받아서 실행하도록 연결한다.

**Tech Stack:** TypeScript, Bun, `jsonc-parser`, Bun test, OpenCode plugin API, Markdown docs

---

## File Map

- Create: `opencode-plugins/cliproxyapi-sync/config.ts`
- Create: `opencode-plugins/cliproxyapi-sync/config.test.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/core.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/package.json`
- Modify: `opencode-plugins/cliproxyapi-sync/bun.lock`
- Modify: `opencode-plugins/cliproxyapi-sync/README.md`
- Modify: `AGENTS.md`

## Constraints

- 현재 로컬 플러그인 엔트리 구조(`cliproxyapi-sync.ts -> ./core`)는 유지한다.
- 사용자가 명시적으로 요청하기 전에는 git commit 을 만들지 않는다.
- `cp-*` provider 생성 규칙과 sync 알고리즘은 바꾸지 않는다.
- 사용자 입력 설정은 `cliproxyapi-sync-config.jsonc`에만 두고, 동기화 결과는 기존처럼 `opencode.json` provider state 에 반영한다.

---

### Task 1: Add dedicated JSONC bootstrap and parsing helpers

**Files:**
- Create: `opencode-plugins/cliproxyapi-sync/config.ts`
- Create: `opencode-plugins/cliproxyapi-sync/config.test.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/package.json`
- Modify: `opencode-plugins/cliproxyapi-sync/bun.lock`

- [ ] **Step 1: Write the failing tests for config path resolution, bootstrap, and JSONC parsing**

Create `opencode-plugins/cliproxyapi-sync/config.test.ts` with this initial content:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"

import {
  buildMissingConfigMessage,
  ensureCliproxyapiConfigBootstrap,
  getConfigPath,
  getPluginConfigPath,
  loadPluginConfig,
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
```

- [ ] **Step 2: Run the new tests to verify they fail for the expected reason**

Run: `bun test config.test.ts`

Expected: FAIL with a module resolution error for `./config` or missing export errors, because the config module does not exist yet.

- [ ] **Step 3: Add the minimal config module and package dependency to make the tests pass**

Update `opencode-plugins/cliproxyapi-sync/package.json` to this shape:

```json
{
  "name": "cliproxyapi-sync",
  "version": "0.1.0",
  "description": "OpenCode plugin — syncs cp-* providers from a cliproxyapi endpoint",
  "type": "module",
  "main": "./cliproxyapi-sync.ts",
  "scripts": {
    "test": "bun test"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.3.15",
    "jsonc-parser": "^3.3.1"
  },
  "devDependencies": {
    "@types/node": "^24.5.2",
    "bun-types": "^1.3.11",
    "typescript": "^5.7.3"
  }
}
```

Create `opencode-plugins/cliproxyapi-sync/config.ts` with this initial implementation:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
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

export function getConfigPath() {
  return process.env.OPENCODE_CONFIG_PATH || join(homedir(), ".config", "opencode", "opencode.json")
}

export function getPluginConfigPath() {
  return join(dirname(getConfigPath()), CONFIG_FILE_NAME)
}

export function buildMissingConfigMessage(filePath = getPluginConfigPath()) {
  return `[cliproxyapi-sync] Sync skipped: fill ${filePath}`
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
```

- [ ] **Step 4: Refresh the package lockfile after adding `jsonc-parser`**

Run: `bun install`

Workdir: `/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync`

Expected: `bun.lock` is updated to include `jsonc-parser` with no install errors.

- [ ] **Step 5: Run the config tests again and make sure they pass**

Run: `bun test config.test.ts`

Expected: PASS with 4 passing tests and no failures.

---

### Task 2: Add legacy migration and dedicated seed-provider state loading

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/config.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/config.test.ts`

- [ ] **Step 1: Add failing tests for migration, cleanup, and missing-value handling**

Append these tests to `opencode-plugins/cliproxyapi-sync/config.test.ts`:

```ts
import type { Config } from "@opencode-ai/plugin"
import { loadSeedProviderState, readPersistedConfig } from "./config"

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
```

- [ ] **Step 2: Run the new migration tests to verify they fail first**

Run: `bun test config.test.ts --test-name-pattern "loadSeedProviderState"`

Expected: FAIL because `loadSeedProviderState` and `readPersistedConfig` do not exist yet.

- [ ] **Step 3: Extend `config.ts` with persisted-config I/O, legacy migration, and seed-provider loading**

Update `opencode-plugins/cliproxyapi-sync/config.ts` to include these additions:

```ts
import type { Config } from "@opencode-ai/plugin"

type ProviderRecord = NonNullable<Config["provider"]>
type ProviderInfo = ProviderRecord[string]
type PersistedConfig = Record<string, unknown> & {
  provider?: Config["provider"]
}

export type SeedProviderState = {
  seedProvider: ProviderInfo | null
  message?: string
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
  const tempPath = `${getConfigPath()}.tmp`
  await writeFile(tempPath, nextContent, "utf8")
  await writeFile(getConfigPath(), nextContent, "utf8")
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

async function writePluginConfigFromLegacy(provider: ProviderInfo, filePath = getPluginConfigPath()): Promise<void> {
  const options = provider?.options && typeof provider.options === "object" ? provider.options : {}
  const content = `{
  // CLI Proxy API base URL, usually ending with /v1
  "baseURL": ${JSON.stringify(typeof options.baseURL === "string" ? options.baseURL : "http://localhost:8317/v1")},

  // API key used for /v1/models
  "apiKey": ${JSON.stringify(typeof options.apiKey === "string" ? options.apiKey : "")},

  // Optional. If omitted, plugin falls back to its default management key.
  "managementKey": ${JSON.stringify(typeof options.managementKey === "string" ? options.managementKey : "")}
}
`

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, { encoding: "utf8", flag: "wx" })
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

    if (!pluginConfig.baseURL || !pluginConfig.apiKey) {
      return { seedProvider: null, message: buildMissingConfigMessage(configPath) }
    }

    return {
      seedProvider: buildSeedProviderFromPluginConfig(pluginConfig),
    }
  }

  if (legacySeedProvider) {
    await writePluginConfigFromLegacy(legacySeedProvider, configPath)
    await removeLegacySeedProvider(runtimeConfig)

    return {
      seedProvider: buildSeedProviderFromPluginConfig(await loadPluginConfig(configPath)!),
    }
  }

  await ensureCliproxyapiConfigBootstrap(configPath)
  return {
    seedProvider: null,
    message: buildMissingConfigMessage(configPath),
  }
}
```

Then replace the temporary `writeConfigAtomically()` implementation with an atomic rename so the final version is:

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"

export async function writeConfigAtomically(config: PersistedConfig): Promise<void> {
  const nextContent = `${JSON.stringify(config, null, 2)}\n`
  const configPath = getConfigPath()
  const tempPath = `${configPath}.tmp`
  await writeFile(tempPath, nextContent, "utf8")
  await rename(tempPath, configPath)
}
```

- [ ] **Step 4: Run the full config test file and make sure the migration cases pass**

Run: `bun test config.test.ts`

Expected: PASS with all bootstrap, parsing, and migration tests green.

---

### Task 3: Route plugin sync through the dedicated config state and add regression tests

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/core.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`

- [ ] **Step 1: Write failing regression tests for the new startup behavior**

Add these helpers near the top of `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`:

```ts
import { getConfigPath, getPluginConfigPath } from "./config"

async function writeTempPluginConfig(config: string) {
  const pluginConfigPath = getPluginConfigPath()
  await fs.mkdir(path.dirname(pluginConfigPath), { recursive: true })
  await fs.writeFile(pluginConfigPath, config, "utf8")
}
```

Replace the existing missing-seed-provider test at the bottom of the file with these exact tests:

```ts
test("syncs when only the dedicated cliproxyapi config file is present", async () => {
  await writeTempOpenCodeConfig({ provider: {} })
  await writeTempPluginConfig(`{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": "test-api-key"
}
`)

  stubAntigravityModelFetch()
  const logs: string[] = []
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

  await plugin.config({ provider: {} })

  expect(logs.some((line) => line.includes("Synced") || line.includes("already up to date"))).toBe(true)
})

test("bootstraps the dedicated config file and logs its path when no config exists", async () => {
  await writeTempOpenCodeConfig({ provider: {} })

  let fetchCalled = false
  const logs: string[] = []
  globalThis.fetch = async () => {
    fetchCalled = true
    return new Response(JSON.stringify({ data: [] }))
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

  await plugin.config({ provider: {} })

  expect(fetchCalled).toBe(false)
  expect(await fs.readFile(getPluginConfigPath(), "utf8")).toContain('"baseURL": "http://localhost:8317/v1"')
  expect(logs).toContain(`[cliproxyapi-sync] Sync skipped: fill ${getPluginConfigPath()}`)
})

test("migrates provider.cliproxyapi into the dedicated config file before syncing", async () => {
  await writeTempOpenCodeConfig({
    provider: {
      cliproxyapi: buildSeedProvider(),
    },
  })

  stubAntigravityModelFetch()
  const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
  const plugin = await CliproxyapiSyncPlugin({
    client: { app: { log: () => Promise.resolve() } },
  })

  await plugin.config({
    provider: {
      cliproxyapi: buildSeedProvider(),
    },
  })

  const pluginConfig = await fs.readFile(getPluginConfigPath(), "utf8")
  const persistedConfig = JSON.parse(await fs.readFile(getConfigPath(), "utf8"))

  expect(pluginConfig).toContain('"apiKey": "test-api-key"')
  expect(persistedConfig.provider.cliproxyapi).toBeUndefined()
  expect(persistedConfig.provider["cp-antigravity"]).toBeDefined()
})
```

- [ ] **Step 2: Run only the new regression tests and watch them fail**

Run: `bun test cliproxyapi-sync.test.ts --test-name-pattern "dedicated cliproxyapi config|bootstraps the dedicated config file|migrates provider.cliproxyapi"`

Expected: FAIL because `core.ts` still only reads `provider.cliproxyapi` directly and still logs the old missing-seed-provider message.

- [ ] **Step 3: Wire `core.ts` to use `loadSeedProviderState()` before syncing**

At the top of `opencode-plugins/cliproxyapi-sync/core.ts`, add the new import:

```ts
import { loadSeedProviderState, readPersistedConfig, writeConfigAtomically } from "./config"
```

Delete the local `getConfigPath()`, `readPersistedConfig()`, and `writeConfigAtomically()` implementations from `core.ts` so the config module becomes the single owner of config-file I/O.

Then replace the start of `syncCliproxyapiProvider()` with this exact block:

```ts
async function syncCliproxyapiProvider(config: Config, log: (message: string) => Promise<void>) {
  const { seedProvider, message } = await loadSeedProviderState(config, resolveSeedProvider(config))
  if (!seedProvider) {
    if (message) {
      await log(message)
    }
    return
  }

  const options = seedProvider.options
  if (!options || typeof options !== "object") return

  const baseURL = typeof options.baseURL === "string" ? options.baseURL : ""
  const apiKey = typeof options.apiKey === "string" ? options.apiKey : ""
  const managementKey = resolveManagementKey(options)
  if (!baseURL || !apiKey) {
    return
  }

  try {
    const oauthModels = await fetchOAuthModels(baseURL, managementKey, log)
    const allModels = await fetchModels(baseURL, apiKey)
    const apiKeyModels = filterApiKeyModels(allModels)

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
      await log("[cliproxyapi-sync] cp-* providers already up to date")
      return result
    }

    await writeConfigAtomically(nextState.config as Config)
    config.provider = nextState.provider
    await log(
      `[cliproxyapi-sync] Synced ${Object.keys(managedProviders ?? {}).length} providers ` +
        `(${oauthModels.data?.length ?? 0} OAuth + ${apiKeyModels.data?.length ?? 0} API-key models)`,
    )
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await log(`[cliproxyapi-sync] Sync skipped: ${message}`)
  }
}
```

- [ ] **Step 4: Run the targeted regressions and then the full package test suite**

Run: `bun test cliproxyapi-sync.test.ts --test-name-pattern "dedicated cliproxyapi config|bootstraps the dedicated config file|migrates provider.cliproxyapi"`

Expected: PASS with 3 passing regression tests.

Run: `bun test`

Expected: PASS with both `config.test.ts` and `cliproxyapi-sync.test.ts` green and no failures.

---

### Task 4: Update package and repository docs for the new config UX

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Replace the package README with source-link + dedicated-config instructions**

Replace `opencode-plugins/cliproxyapi-sync/README.md` with this exact content:

```markdown
# cliproxyapi-sync

OpenCode plugin that syncs `cp-*` providers from a cliproxyapi endpoint into the local OpenCode config.

## Local setup

Link the TypeScript plugin entry into the global OpenCode plugins directory.

```bash
ln -sfn "/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.ts" "/Users/donggeollee/.config/opencode/plugins/cliproxyapi-sync.ts"
```

## Plugin config

On first startup the plugin bootstraps `~/.config/opencode/cliproxyapi-sync-config.jsonc` if it does not already exist.

```jsonc
{
  // CLI Proxy API base URL, usually ending with /v1
  "baseURL": "http://localhost:8317/v1",

  // API key used for /v1/models
  "apiKey": "",

  // Optional. If omitted, plugin falls back to its default management key.
  "managementKey": ""
}
```

Fill `baseURL` and `apiKey` in that file instead of adding `provider.cliproxyapi` to `~/.config/opencode/opencode.json`.

If an older `provider.cliproxyapi` entry is still present, the plugin migrates it into `cliproxyapi-sync-config.jsonc` automatically and removes the legacy entry from `opencode.json`.
```

- [ ] **Step 2: Update `AGENTS.md` to mention the dedicated config file explicitly**

Update the existing resource mapping row to this exact line:

```markdown
| `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.ts` | `~/.config/opencode/plugins/cliproxyapi-sync.ts` | 소스 직접 심링크, 설정은 `~/.config/opencode/cliproxyapi-sync-config.jsonc` |
```

Then replace the current cliproxyapi-sync example block with this exact block:

```bash
# cliproxyapi-sync (소스 직접 심링크, 빌드 불필요)
ln -s $REPO/opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.ts $OC/plugins/cliproxyapi-sync.ts

# cliproxyapi-sync config
# 첫 실행 시 $OC/cliproxyapi-sync-config.jsonc 가 자동 생성된다.
# baseURL / apiKey 는 provider.cliproxyapi 대신 이 파일에 입력한다.
```

- [ ] **Step 3: Verify the docs point to the new dedicated config flow**

Run: `rg -n "cliproxyapi-sync-config.jsonc|provider\.cliproxyapi|cliproxyapi-sync\.ts" "opencode-plugins/cliproxyapi-sync/README.md" "AGENTS.md"`

Expected: matches show the source `.ts` symlink path, the dedicated `jsonc` config path, and the migration-away-from-`provider.cliproxyapi` guidance.

---

### Task 5: Final verification before handoff

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/config.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/config.test.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/core.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`
- Modify: `opencode-plugins/cliproxyapi-sync/package.json`
- Modify: `opencode-plugins/cliproxyapi-sync/bun.lock`
- Modify: `opencode-plugins/cliproxyapi-sync/README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Run the plugin package test suite from the package directory**

Run: `bun test`

Workdir: `/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync`

Expected: PASS with both test files green.

- [ ] **Step 2: Run a repository-level grep to confirm only the new config UX is documented**

Run: `rg -n "cliproxyapi-sync-config.jsonc|provider\.cliproxyapi|seed provider is not configured" "/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt"`

Expected: documentation points at `cliproxyapi-sync-config.jsonc`; old `seed provider is not configured` wording remains only in historical specs/plans or updated tests that intentionally reference migration behavior.

- [ ] **Step 3: Do not create a commit unless the user explicitly asks for one**

This repository rule overrides the default “frequent commits” advice in the generic planning template.

---

## Self-Review Checklist

- Spec coverage: the plan covers dedicated `jsonc` bootstrap, legacy migration, automatic cleanup, startup guidance logs, docs updates, and full test verification.
- Placeholder scan: no `TBD`, `TODO`, or vague “handle appropriately” language remains.
- Type consistency: all tasks use the same `cliproxyapi-sync-config.jsonc` path, the same `loadSeedProviderState()` entry point, and the same `provider.cliproxyapi` legacy source name.
