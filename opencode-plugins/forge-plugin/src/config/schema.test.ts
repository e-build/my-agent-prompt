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
        planner: { model: "openai/gpt-5.4" },
      },
    })

    expect(result.agents?.scouter?.model).toBe("anthropic/claude-haiku-4-5")
    expect(result.agents?.planner?.model).toBe("openai/gpt-5.4")
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
})
