import { describe, expect, test } from "bun:test"
import { createCategoryRouter, DEFAULT_MODELS } from "./category-router"

describe("createCategoryRouter", () => {
  test("returns default category models", () => {
    const router = createCategoryRouter({})

    expect(router.resolveCategory("quick")).toBe(DEFAULT_MODELS.quick)
    expect(router.resolveCategory("standard")).toBe(DEFAULT_MODELS.standard)
    expect(router.resolveCategory("deep")).toBe(DEFAULT_MODELS.deep)
    expect(router.resolveCategory("visual")).toBe(DEFAULT_MODELS.visual)
  })

  test("prefers agent override over category override", () => {
    const router = createCategoryRouter({
      categories: {
        standard: { model: "openai/gpt-4o" },
      },
      agents: {
        pilot: { model: "anthropic/claude-opus-4-6" },
      },
    })

    expect(router.resolveAgent("pilot", "standard")).toBe("anthropic/claude-opus-4-6")
    expect(router.resolveAgent("worker", "standard")).toBe("openai/gpt-4o")
  })

  test("parses provider and model ids", () => {
    expect(routerRef(createCategoryRouter({}), "anthropic/claude-sonnet-4-6")).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
    })
  })
})

function routerRef(router: ReturnType<typeof createCategoryRouter>, model: string) {
  return router.parse(model)
}
