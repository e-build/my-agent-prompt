import { describe, expect, test } from "bun:test"
import { createAgentRegistry } from "./agent-registry"

describe("createAgentRegistry", () => {
  test("tracks active and disabled agents", () => {
    const registry = createAgentRegistry({
      disabled_agents: ["planner", "architect"],
    })

    expect(registry.getActive().map((agent) => agent.name)).toEqual([
      "pilot",
      "worker",
      "scouter",
      "researcher",
    ])
    expect(registry.isDisabled("pilot")).toBe(false)
    expect(registry.isDisabled("planner")).toBe(true)
  })

  test("enforces delegation rules", () => {
    const registry = createAgentRegistry({})

    expect(registry.canDelegate("pilot", "worker")).toBe(true)
    expect(registry.canDelegate("pilot", "planner")).toBe(false)
    expect(registry.canDelegate("pilot", "researcher")).toBe(true)
    expect(registry.canDelegate("worker", "scouter")).toBe(false)
    expect(registry.canDelegate("architect", "scouter")).toBe(true)
    expect(registry.canDelegate("architect", "researcher")).toBe(true)
  })

  test("builds agent configs with prompt append", () => {
    const registry = createAgentRegistry({
      agents: {
        pilot: { prompt_append: "Use concise outputs." },
      },
    })

    const config = registry.buildConfig("pilot", "anthropic/claude-sonnet-4-6")
    expect(config.model).toBe("anthropic/claude-sonnet-4-6")
    expect(config.prompt).toContain("Use concise outputs.")
  })
})
