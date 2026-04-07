import { describe, expect, test } from "bun:test"
import type { Config } from "@opencode-ai/plugin"
import { createAgentRegistrar } from "./agent-registrar"
import { createAgentRegistry } from "../kernel/agent-registry"
import { createCategoryRouter } from "../kernel/category-router"

describe("createAgentRegistrar", () => {
  test("registers active agents and start-work command", async () => {
    const config = {} as Config
    const registry = createAgentRegistry({
      disabled_agents: ["architect"],
    })
    const router = createCategoryRouter({})

    await createAgentRegistrar(registry, router)(config)

    expect(Object.keys(config.agent ?? {}).sort()).toEqual([
      "pilot",
      "planner",
      "scouter",
      "worker",
    ])
    expect(config.command?.["start-work"]?.agent).toBe("pilot")
  })
})
