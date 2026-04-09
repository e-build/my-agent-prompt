import { describe, expect, test } from "bun:test"
import { createAgentModelResolver, DEFAULT_AGENT_MODELS } from "./agent-model-resolver"

describe("createAgentModelResolver", () => {
  test("returns default agent models", () => {
    const resolver = createAgentModelResolver({})

    expect(resolver.resolveAgentModel("pilot")).toBe(DEFAULT_AGENT_MODELS.pilot)
    expect(resolver.resolveAgentModel("planner")).toBe(DEFAULT_AGENT_MODELS.planner)
    expect(resolver.resolveAgentModel("architect")).toBe(DEFAULT_AGENT_MODELS.architect)
    expect(resolver.resolveAgentModel("worker")).toBe(DEFAULT_AGENT_MODELS.worker)
    expect(resolver.resolveAgentModel("scouter")).toBe(DEFAULT_AGENT_MODELS.scouter)
    expect(resolver.resolveAgentModel("researcher")).toBe(DEFAULT_AGENT_MODELS.researcher)
  })

  test("prefers agent override over default model", () => {
    const resolver = createAgentModelResolver({
      agents: {
        worker: { model: "cp-github-copilot/claude-sonnet-4.6" },
      },
    })

    expect(resolver.resolveAgentModel("worker")).toBe(
      "cp-github-copilot/claude-sonnet-4.6",
    )
  })

  test("resolves primary model and fallback chain together", () => {
    const resolver = createAgentModelResolver({
      agents: {
        worker: {
          model: "cp-github-copilot/claude-sonnet-4.6",
          fallback_models: ["cp-openai/gpt-5.4", "cp-openai/gpt-5-mini"],
        },
      },
    })

    expect(resolver.resolveAgentRoute("worker")).toEqual({
      model: "cp-github-copilot/claude-sonnet-4.6",
      fallbackModels: ["cp-openai/gpt-5.4", "cp-openai/gpt-5-mini"],
    })
  })

  test("parses provider and model ids", () => {
    expect(createAgentModelResolver({}).parse("cp-openai/gpt-5.4")).toEqual({
      providerID: "cp-openai",
      modelID: "gpt-5.4",
    })
  })
})
