import { describe, expect, test } from "bun:test"
import { ForgeConfigSchema } from "./schema"

describe("ForgeConfigSchema", () => {
  test("parses empty config", () => {
    expect(ForgeConfigSchema.parse({})).toEqual({})
  })

  test("parses category overrides", () => {
    const result = ForgeConfigSchema.parse({
      categories: {
        quick: { model: "anthropic/claude-haiku-4-5" },
        deep: { model: "openai/gpt-5.4" },
      },
    })

    expect(result.categories?.quick?.model).toBe("anthropic/claude-haiku-4-5")
    expect(result.categories?.deep?.model).toBe("openai/gpt-5.4")
  })

  test("rejects disabled pilot", () => {
    expect(() =>
      ForgeConfigSchema.parse({
        disabled_agents: ["pilot"],
      }),
    ).toThrow()
  })
})
