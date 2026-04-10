import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"

import {
  buildManagedProviders,
  buildModelsByOwner,
  buildNextProviderState,
  filterApiKeyModels,
  normalizeAuthFileModels,
  resolveSeedProvider,
} from "./core"
import { getConfigPath, getPluginConfigPath } from "./config"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  delete process.env.OPENCODE_CONFIG_PATH
})

async function writeTempOpenCodeConfig(config: unknown) {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "cliproxyapi-sync-"))
  const configDir = path.join(tempHome, ".config", "opencode")
  const configPath = path.join(configDir, "opencode.json")
  await fs.mkdir(configDir, { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8")
  process.env.OPENCODE_CONFIG_PATH = configPath
}

async function writeTempPluginConfig(config: string) {
  const pluginConfigPath = getPluginConfigPath()
  await fs.mkdir(path.dirname(pluginConfigPath), { recursive: true })
  await fs.writeFile(pluginConfigPath, config, "utf8")
}

function stubAntigravityModelFetch() {
  globalThis.fetch = async (input) => {
    const url = String(input)

    // Management: auth-files — only antigravity OAuth
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

    // Management: auth-files/models for antigravity
    if (url.includes("/v0/management/auth-files/models")) {
      return new Response(
        JSON.stringify({
          models: [{ id: "gemini-3-flash", owned_by: "antigravity", display_name: "Gemini 3 Flash", type: "antigravity" }],
        }),
      )
    }

    // v1/models — antigravity is an OAuth owner so it will be filtered out by filterApiKeyModels
    if (url === "http://localhost:8317/v1/models") {
      return new Response(
        JSON.stringify({
          data: [{ id: "gemini-3-flash", owned_by: "antigravity" }],
        }),
      )
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
}

function buildSeedProvider() {
  return {
    name: "CLIProxyAPI",
    npm: "@ai-sdk/openai-compatible",
    options: {
      apiKey: "test-api-key",
      baseURL: "http://localhost:8317/v1",
    },
    models: {},
  }
}

function buildAntigravityProvider() {
  return {
    name: "CP Antigravity",
    npm: "@ai-sdk/openai-compatible",
    options: {
      apiKey: "test-api-key",
      baseURL: "http://localhost:8317/v1",
    },
    models: {
      "gemini-3-flash": {
        name: "Gemini 3 Flash",
        variants: {
          minimal: { reasoningEffort: "minimal" },
          low: { reasoningEffort: "low" },
          medium: { reasoningEffort: "medium" },
          high: { reasoningEffort: "high" },
        },
      },
    },
  }
}

describe("resolveSeedProvider", () => {
  test("returns cliproxyapi seed provider when present", () => {
    const config = {
      provider: {
        cliproxyapi: {
          name: "CLIProxyAPI",
          npm: "@ai-sdk/openai-compatible",
          options: { apiKey: "key", baseURL: "http://localhost:8317/v1" },
          models: {},
        },
      },
    }
    expect(resolveSeedProvider(config)).toBe(config.provider.cliproxyapi)
  })

  test("does not use cp-openai as seed provider fallback", () => {
    const config = {
      provider: {
        "cp-openai": {
          name: "CP OpenAI",
          npm: "@ai-sdk/openai-compatible",
          options: { apiKey: "key", baseURL: "http://localhost:8317/v1" },
          models: {},
        },
      },
    }
    expect(resolveSeedProvider(config)).toBeNull()
  })

  test("returns null when no seed provider exists", () => {
    expect(resolveSeedProvider({ provider: {} })).toBeNull()
    expect(resolveSeedProvider({})).toBeNull()
  })
})

describe("filterApiKeyModels", () => {
  test("filters out known OAuth owners from v1/models", () => {
    const payload = {
      data: [
        { id: "gpt-5", owned_by: "openai" },
        { id: "gemini-3-flash", owned_by: "antigravity" },
        { id: "claude-sonnet", owned_by: "github-copilot" },
        { id: "go-glm-5", owned_by: "opencode-go" },
        { id: "zai-glm-5.1", owned_by: "zai" },
      ],
    }
    const result = filterApiKeyModels(payload)
    expect(result.data?.map((m) => m.id)).toEqual(["go-glm-5", "zai-glm-5.1"])
  })

  test("passes through models with unknown owners", () => {
    const payload = {
      data: [{ id: "custom-model", owned_by: "my-custom-provider" }],
    }
    expect(filterApiKeyModels(payload).data).toEqual(payload.data)
  })

  test("handles empty data gracefully", () => {
    expect(filterApiKeyModels({}).data).toEqual([])
    expect(filterApiKeyModels({ data: [] }).data).toEqual([])
  })
})

describe("normalizeAuthFileModels", () => {
  test("converts auth-file model responses to ModelResponse format", () => {
    const result = normalizeAuthFileModels([
      {
        models: [
          { id: "gpt-5.4", owned_by: "openai", display_name: "GPT 5.4" },
          { id: "gemini-3-flash", owned_by: "antigravity", display_name: "Gemini 3 Flash" },
        ],
      },
    ])
    expect(result.data).toEqual([
      { id: "gpt-5.4", owned_by: "openai" },
      { id: "gemini-3-flash", owned_by: "antigravity" },
    ])
  })

  test("merges multiple auth-file responses", () => {
    const result = normalizeAuthFileModels([
      { models: [{ id: "model-a", owned_by: "owner-a" }] },
      { models: [{ id: "model-b", owned_by: "owner-b" }] },
    ])
    expect(result.data?.map((m) => m.id)).toEqual(["model-a", "model-b"])
  })

  test("skips models with missing id or owned_by", () => {
    const result = normalizeAuthFileModels([
      {
        models: [
          { id: "valid-model", owned_by: "owner" },
          { id: "", owned_by: "owner" },
          { owned_by: "owner" },
          { id: "no-owner" },
        ],
      },
    ])
    expect(result.data).toEqual([{ id: "valid-model", owned_by: "owner" }])
  })

  test("handles empty responses gracefully", () => {
    expect(normalizeAuthFileModels([]).data).toEqual([])
    expect(normalizeAuthFileModels([{}]).data).toEqual([])
  })
})

describe("buildModelsByOwner", () => {
  test("adds github-copilot reasoning variants from management metadata", () => {
    const result = buildModelsByOwner(
      {
        data: [{ id: "gpt-5.4", owned_by: "github-copilot" }],
      },
      {
        "github-copilot": {
          "gpt-5.4": {
            displayName: "GPT-5.4",
            thinkingLevels: ["none", "low", "medium", "high", "xhigh"],
          },
        },
      },
    )

    expect(result["github-copilot"]["gpt-5.4"]).toEqual({
      name: "GPT-5.4",
      variants: {
        low: {
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
        medium: {
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
        high: {
          reasoningEffort: "high",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
        xhigh: {
          reasoningEffort: "xhigh",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    })
  })

  test("adds openai reasoning variants from codex metadata", () => {
    const result = buildModelsByOwner(
      {
        data: [{ id: "gpt-5.4", owned_by: "openai" }],
      },
      {
        openai: {
          "gpt-5.4": {
            displayName: "GPT 5.4",
            thinkingLevels: ["low", "medium", "high", "xhigh"],
          },
        },
      },
    )

    expect(result.openai["gpt-5.4"]).toEqual({
      name: "GPT 5.4",
      variants: {
        low: {
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
        medium: {
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
        high: {
          reasoningEffort: "high",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
        xhigh: {
          reasoningEffort: "xhigh",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    })
  })

  test("adds generic provider variants from thinking metadata", () => {
    const result = buildModelsByOwner(
      {
        data: [{ id: "gemini-3-flash", owned_by: "antigravity" }],
      },
      {
        antigravity: {
          "gemini-3-flash": {
            displayName: "Gemini 3 Flash",
            thinkingLevels: ["minimal", "low", "medium", "high"],
          },
        },
      },
    )

    expect(result.antigravity["gemini-3-flash"]).toEqual({
      name: "Gemini 3 Flash",
      variants: {
        minimal: {
          reasoningEffort: "minimal",
        },
        low: {
          reasoningEffort: "low",
        },
        medium: {
          reasoningEffort: "medium",
        },
        high: {
          reasoningEffort: "high",
        },
      },
    })
  })

  test("keeps models simple when metadata is missing", () => {
    const result = buildModelsByOwner({
      data: [{ id: "gpt-5.4", owned_by: "openai" }],
    })

    expect(result["openai"]["gpt-5.4"]).toEqual({
      name: "gpt-5.4",
    })
  })

  test("strips management keys from persisted provider options", () => {
    const managedProviders = buildManagedProviders(
      {
        name: "Seed",
        npm: "@ai-sdk/openai-compatible",
        options: {
          apiKey: "test-key",
          baseURL: "http://localhost:8317/v1",
          managementKey: "secret-a",
          management_key: "secret-b",
        },
        models: {},
      },
      {
        openai: {
          "gpt-5.4": {
            name: "GPT 5.4",
          },
        },
      },
    )

    expect(managedProviders["cp-openai"].options).toEqual({
      apiKey: "test-key",
      baseURL: "http://localhost:8317/v1",
    })
  })

  test("strips management keys from persisted seed provider options", () => {
    const nextState = buildNextProviderState(
      {
        provider: {
          cliproxyapi: {
            name: "CLIProxyAPI",
            npm: "@ai-sdk/openai-compatible",
            options: {
              apiKey: "test-key",
              baseURL: "http://localhost:8317/v1",
              managementKey: "secret-a",
              management_key: "secret-b",
            },
            models: {},
          },
        },
      },
      {
        "cp-openai": {
          name: "CP OpenAI",
          npm: "@ai-sdk/openai-compatible",
          options: {
            apiKey: "test-key",
            baseURL: "http://localhost:8317/v1",
          },
          models: {},
        },
      },
    )

    expect(nextState.config.provider?.cliproxyapi.options).toEqual({
      apiKey: "test-key",
      baseURL: "http://localhost:8317/v1",
    })
  })
})

describe("CliproxyapiSyncPlugin", () => {
  test("plugin entry exports only the plugin function for local loading", async () => {
    const module = await import("./cliproxyapi-sync")

    expect(Object.keys(module).sort()).toEqual(["CliproxyapiSyncPlugin"])
  })

  test("uses an explicit config path override when provided", () => {
    process.env.OPENCODE_CONFIG_PATH = "/tmp/opencode-test-config.json"

    expect(getConfigPath()).toBe("/tmp/opencode-test-config.json")
  })

  test("maps thinking metadata to matching generic provider owners during sync", async () => {
    await writeTempOpenCodeConfig({
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    })
    stubAntigravityModelFetch()

    const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
    const plugin = await CliproxyapiSyncPlugin({
      client: {
        app: {
          log: () => Promise.resolve(),
        },
      },
    })
    const config = {
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    }

    await plugin.config(config)

    expect(config.provider?.["cp-antigravity"]?.models?.["gemini-3-flash"]).toEqual({
      name: "Gemini 3 Flash",
      variants: {
        minimal: { reasoningEffort: "minimal" },
        low: { reasoningEffort: "low" },
        medium: { reasoningEffort: "medium" },
        high: { reasoningEffort: "high" },
      },
    })
  })

  test("shows a success toast after config hook completes with delay", async () => {
    await writeTempOpenCodeConfig({
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    })
    stubAntigravityModelFetch()

    const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
    const toastCalls: unknown[] = []
    const plugin = await CliproxyapiSyncPlugin({
      client: {
        app: {
          log: () => Promise.resolve(),
        },
        tui: {
          showToast: (input) => {
            toastCalls.push(input)
            return Promise.resolve(true)
          },
        },
      },
    })

    await plugin.config({
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    })

    // Toast should not fire immediately (needs delay for TUI to connect)
    expect(toastCalls).toEqual([])

    // Wait for the delayed toast to fire
    await new Promise((resolve) => setTimeout(resolve, 4000))

    expect(toastCalls).toEqual([
      {
        body: {
          title: "CLIProxyAPI Sync",
          message:
            "CLIProxyAPI sync updated: 1 providers, 1 models. Added provider cp-antigravity, model cp-antigravity/gemini-3-flash",
          variant: "success",
          duration: 5000,
        },
      },
    ])
  })

  test("shows a success toast when providers are already up to date", async () => {
    await writeTempOpenCodeConfig({
      provider: {
        cliproxyapi: buildSeedProvider(),
        "cp-antigravity": buildAntigravityProvider(),
      },
    })
    stubAntigravityModelFetch()

    const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
    const toastCalls: unknown[] = []
    const plugin = await CliproxyapiSyncPlugin({
      client: {
        app: {
          log: () => Promise.resolve(),
        },
        tui: {
          showToast: (input) => {
            toastCalls.push(input)
            return Promise.resolve(true)
          },
        },
      },
    })

    await plugin.config({
      provider: {
        cliproxyapi: buildSeedProvider(),
        "cp-antigravity": buildAntigravityProvider(),
      },
    })

    // Wait for the delayed toast
    await new Promise((resolve) => setTimeout(resolve, 4000))

    expect(toastCalls).toEqual([
      {
        body: {
          title: "CLIProxyAPI Sync",
          message: "CLIProxyAPI sync up to date: 1 providers, 1 models",
          variant: "success",
          duration: 5000,
        },
      },
    ])
  })

  test("shows a warning toast for partial sync when apiKey is blank", async () => {
    await writeTempOpenCodeConfig({ provider: {} })
    await writeTempPluginConfig(`{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": ""
}
`)

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
    const toastCalls: unknown[] = []
    const plugin = await CliproxyapiSyncPlugin({
      client: {
        app: {
          log: () => Promise.resolve(),
        },
        tui: {
          showToast: (input) => {
            toastCalls.push(input)
            return Promise.resolve(true)
          },
        },
      },
    })

    await plugin.config({ provider: {} })

    expect(toastCalls).toEqual([])

    await new Promise((resolve) => setTimeout(resolve, 4000))

    expect(toastCalls).toEqual([
      {
        body: {
          title: "CLIProxyAPI Sync",
          message:
            `[cliproxyapi-sync] Partial sync: API-key models skipped (Model fetch failed with 401 Unauthorized). ` +
            `Fill ${getPluginConfigPath()} to enable /v1/models sync.`,
          variant: "warning",
          duration: 5000,
        },
      },
    ])
  })

  test("shows a warning toast with config guidance when baseURL is missing", async () => {
    await writeTempOpenCodeConfig({ provider: {} })
    await writeTempPluginConfig(`{
  "baseURL": "",
  "apiKey": "test-api-key"
}
`)

    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return new Response(JSON.stringify({ data: [] }))
    }

    const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
    const toastCalls: unknown[] = []
    const plugin = await CliproxyapiSyncPlugin({
      client: {
        app: {
          log: () => Promise.resolve(),
        },
        tui: {
          showToast: (input) => {
            toastCalls.push(input)
            return Promise.resolve(true)
          },
        },
      },
    })

    await plugin.config({ provider: {} })

    expect(fetchCalled).toBe(false)
    expect(toastCalls).toEqual([])

    await new Promise((resolve) => setTimeout(resolve, 4000))

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

  test("does not fail sync when showing the success toast throws", async () => {
    await writeTempOpenCodeConfig({
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    })
    stubAntigravityModelFetch()

    const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
    const plugin = await CliproxyapiSyncPlugin({
      client: {
        app: {
          log: () => Promise.resolve(),
        },
        tui: {
          showToast: () => {
            throw new Error("toast unavailable")
          },
        },
      },
    })
    const config = {
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    }

    await expect(plugin.config(config)).resolves.toBeUndefined()
    // Wait for delayed toast (should not throw)
    await new Promise((resolve) => setTimeout(resolve, 4000))
    expect(config.provider?.["cp-antigravity"]?.models?.["gemini-3-flash"]?.name).toBe("Gemini 3 Flash")
  })

  test("shows toast exactly once even with multiple config calls", async () => {
    await writeTempOpenCodeConfig({
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    })
    stubAntigravityModelFetch()

    const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
    const toastCalls: unknown[] = []
    const plugin = await CliproxyapiSyncPlugin({
      client: {
        app: {
          log: () => Promise.resolve(),
        },
        tui: {
          showToast: (input) => {
            toastCalls.push(input)
            return Promise.resolve(true)
          },
        },
      },
    })

    await plugin.config({
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    })

    // Wait for delayed toast
    await new Promise((resolve) => setTimeout(resolve, 4000))

    expect(toastCalls).toHaveLength(1)
  })

  test("excludes openai models when codex OAuth auth-file is absent", async () => {
    await writeTempOpenCodeConfig({
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    })

    // auth-files returns nothing (codex OAuth removed), v1/models still has openai
    globalThis.fetch = async (input) => {
      const url = String(input)
      if (url.endsWith("/v0/management/auth-files")) {
        return new Response(JSON.stringify({ files: [] }))
      }
      if (url.endsWith("/v1/models")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "gpt-5.4", owned_by: "openai" },
              { id: "go-glm-5", owned_by: "opencode-go" },
            ],
          }),
        )
      }
      return new Response(JSON.stringify({ channel: url.split("/").at(-1), models: [] }))
    }

    const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")
    const plugin = await CliproxyapiSyncPlugin({
      client: { app: { log: () => Promise.resolve() } },
    })
    const config = { provider: { cliproxyapi: buildSeedProvider() } }
    await plugin.config(config)

    expect(config.provider?.["cp-openai"]).toBeUndefined()
    expect(config.provider?.["cp-opencode-go"]).toBeDefined()
    expect(config.provider?.["cp-opencode-go"]?.models?.["go-glm-5"]).toBeDefined()
  })

  test("ignores disabled OAuth auth-files", async () => {
    await writeTempOpenCodeConfig({
      provider: {
        cliproxyapi: buildSeedProvider(),
      },
    })

    const requestedAuthFiles: string[] = []
    globalThis.fetch = async (input) => {
      const url = String(input)

      if (url.endsWith("/v0/management/auth-files")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                name: "codex-disabled.json",
                provider: "codex",
                account_type: "oauth",
                disabled: true,
                status: "active",
              },
              {
                name: "antigravity-active.json",
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
        const name = new URL(url).searchParams.get("name")
        requestedAuthFiles.push(name || "")

        if (name === "antigravity-active.json") {
          return new Response(
            JSON.stringify({
              models: [{ id: "gemini-3-flash", owned_by: "antigravity", display_name: "Gemini 3 Flash", type: "antigravity" }],
            }),
          )
        }

        if (name === "codex-disabled.json") {
          return new Response(
            JSON.stringify({
              models: [{ id: "gpt-5.4", owned_by: "openai", display_name: "GPT 5.4", type: "openai" }],
            }),
          )
        }
      }

      if (url.endsWith("/v1/models")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "gpt-5.4", owned_by: "openai" },
              { id: "gemini-3-flash", owned_by: "antigravity" },
              { id: "go-glm-5", owned_by: "opencode-go" },
            ],
          }),
        )
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
      client: { app: { log: () => Promise.resolve() } },
    })
    const config = { provider: { cliproxyapi: buildSeedProvider() } }
    await plugin.config(config)

    expect(requestedAuthFiles).toEqual(["antigravity-active.json"])
    expect(config.provider?.["cp-openai"]).toBeUndefined()
    expect(config.provider?.["cp-antigravity"]?.models?.["gemini-3-flash"]).toBeDefined()
    expect(config.provider?.["cp-opencode-go"]?.models?.["go-glm-5"]).toBeDefined()
  })

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

  test("does not downgrade to partial sync when apiKey is present and /v1/models fails", async () => {
    await writeTempOpenCodeConfig({ provider: {} })
    await writeTempPluginConfig(`{
  "baseURL": "http://localhost:8317/v1",
  "apiKey": "test-api-key"
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
        expect(init?.headers).toEqual({
          Authorization: "Bearer test-api-key",
        })
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
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

    expect(config.provider?.["cp-antigravity"]).toBeUndefined()
    expect(logs).toContain("[cliproxyapi-sync] Sync skipped: Model fetch failed with 401 Unauthorized")
    expect(logs.some((line) => line.includes("Partial sync: API-key models skipped"))).toBe(false)
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

})
