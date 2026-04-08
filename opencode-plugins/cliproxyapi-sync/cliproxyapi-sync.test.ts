import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"

import { buildManagedProviders, buildModelsByOwner, buildNextProviderState, getConfigPath } from "./cliproxyapi-sync"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  delete process.env.OPENCODE_CONFIG_PATH
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
  test("uses an explicit config path override when provided", () => {
    process.env.OPENCODE_CONFIG_PATH = "/tmp/opencode-test-config.json"

    expect(getConfigPath()).toBe("/tmp/opencode-test-config.json")
  })

  test("maps thinking metadata to matching generic provider owners during sync", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "cliproxyapi-sync-"))
    const configDir = path.join(tempHome, ".config", "opencode")
    const configPath = path.join(configDir, "opencode.json")
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(
      configPath,
      `${JSON.stringify({
        provider: {
          cliproxyapi: {
            name: "CLIProxyAPI",
            npm: "@ai-sdk/openai-compatible",
            options: {
              apiKey: "test-api-key",
              baseURL: "http://localhost:8317/v1",
            },
            models: {},
          },
        },
      })}\n`,
      "utf8",
    )

    process.env.OPENCODE_CONFIG_PATH = configPath
    const { CliproxyapiSyncPlugin } = await import("./cliproxyapi-sync")

    globalThis.fetch = async (input) => {
      const url = String(input)
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

    const plugin = await CliproxyapiSyncPlugin({
      client: {
        app: {
          log: () => Promise.resolve(),
        },
      },
    })
    const config = {
      provider: {
        cliproxyapi: {
          name: "CLIProxyAPI",
          npm: "@ai-sdk/openai-compatible",
          options: {
            apiKey: "test-api-key",
            baseURL: "http://localhost:8317/v1",
          },
          models: {},
        },
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
})
