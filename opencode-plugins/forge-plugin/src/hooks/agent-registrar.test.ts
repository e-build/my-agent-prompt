import { describe, expect, test } from "bun:test"
import type { Config } from "@opencode-ai/plugin"
import { createAgentRegistrar } from "./agent-registrar"
import { createAgentRegistry } from "../kernel/agent-registry"
import { createAgentModelResolver } from "../kernel/agent-model-resolver"

describe("createAgentRegistrar", () => {
  test("registers active agents and start-work command", async () => {
    const config = {} as Config
    const registry = createAgentRegistry({
      disabled_agents: ["architect"],
    })
    const resolver = createAgentModelResolver({})

    await createAgentRegistrar(registry, resolver)(config)

    expect(Object.keys(config.agent ?? {}).sort()).toEqual([
      "pilot",
      "planner",
      "researcher",
      "scouter",
      "worker",
    ])
    expect(config.command?.["start-work"]?.agent).toBe("pilot")
    expect(config.command?.["forge-models"]?.agent).toBe("pilot")
  })

  test("disables builtin OpenCode agents when configured", async () => {
    const config = {
      agent: {
        build: { description: "builtin build" },
        plan: { description: "builtin plan" },
        general: { description: "builtin general" },
        explore: { description: "builtin explore" },
      },
    } as Config
    const registry = createAgentRegistry({})
    const resolver = createAgentModelResolver({
      disable_builtin_agents: true,
    })

    await createAgentRegistrar(registry, resolver, {
      disable_builtin_agents: true,
    })(config)

    expect(config.agent?.build).toMatchObject({ disable: true, description: "builtin build" })
    expect(config.agent?.plan).toMatchObject({ disable: true, description: "builtin plan" })
    expect(config.agent?.general).toMatchObject({ disable: true, description: "builtin general" })
    expect(config.agent?.explore).toMatchObject({ disable: true, description: "builtin explore" })
    expect(config.agent?.pilot).toBeDefined()
  })

  test("keeps builtin OpenCode agents untouched when toggle is off", async () => {
    const config = {
      agent: {
        build: { description: "builtin build" },
      },
    } as Config
    const registry = createAgentRegistry({})
    const resolver = createAgentModelResolver({})

    await createAgentRegistrar(registry, resolver)(config)

    expect(config.agent?.build).toEqual({ description: "builtin build" })
  })
})
