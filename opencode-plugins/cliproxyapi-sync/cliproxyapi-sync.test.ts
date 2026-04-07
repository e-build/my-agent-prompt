import { describe, expect, test } from "bun:test"

import { buildManagedProviders, buildModelsByOwner } from "./cliproxyapi-sync"

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
})
