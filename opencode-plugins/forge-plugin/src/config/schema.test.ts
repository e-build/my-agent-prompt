import { describe, expect, test } from "bun:test"
import { ForgeConfigSchema } from "./schema"

describe("ForgeConfigSchema", () => {
  test("parses empty config", () => {
    expect(ForgeConfigSchema.parse({})).toEqual({})
  })

  test("parses agent model overrides", () => {
    const result = ForgeConfigSchema.parse({
      agents: {
        scouter: { model: "anthropic/claude-haiku-4-5" },
        researcher: {
          model: "openai/gpt-5.4",
          fallback_models: ["openai/gpt-5-mini", "anthropic/claude-sonnet-4-6"],
        },
        planner: { model: "openai/gpt-5.4" },
      },
    })

    expect(result.agents?.scouter?.model).toBe("anthropic/claude-haiku-4-5")
    expect(result.agents?.researcher?.model).toBe("openai/gpt-5.4")
    expect(result.agents?.researcher?.fallback_models).toEqual([
      "openai/gpt-5-mini",
      "anthropic/claude-sonnet-4-6",
    ])
    expect(result.agents?.planner?.model).toBe("openai/gpt-5.4")
  })

  test("allows empty fallback model list", () => {
    const result = ForgeConfigSchema.parse({
      agents: {
        worker: { fallback_models: [] },
      },
    })

    expect(result.agents?.worker?.fallback_models).toEqual([])
  })

  test("rejects more than two fallback models", () => {
    expect(() =>
      ForgeConfigSchema.parse({
        agents: {
          worker: {
            fallback_models: [
              "openai/gpt-5.4",
              "openai/gpt-5-mini",
              "anthropic/claude-sonnet-4-6",
            ],
          },
        },
      }),
    ).toThrow()
  })

  test("rejects category overrides", () => {
    expect(() =>
      ForgeConfigSchema.parse({
        categories: {
          quick: { model: "anthropic/claude-haiku-4-5" },
        },
      }),
    ).toThrow()
  })

  test("rejects disabled pilot", () => {
    expect(() =>
      ForgeConfigSchema.parse({
        disabled_agents: ["pilot"],
      }),
    ).toThrow()
  })

  test("parses builtin disable toggle", () => {
    expect(
      ForgeConfigSchema.parse({
        disable_builtin_agents: true,
      }).disable_builtin_agents,
    ).toBe(true)
  })
})
