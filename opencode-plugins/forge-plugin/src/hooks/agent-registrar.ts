import type { Config } from "@opencode-ai/plugin"
import type { AgentRegistry } from "../kernel/agent-registry"
import type { CategoryRouter } from "../kernel/category-router"

export function createAgentRegistrar(registry: AgentRegistry, router: CategoryRouter) {
  return async (config: Config) => {
    config.agent = {
      ...(config.agent ?? {}),
    }

    for (const definition of registry.getActive()) {
      config.agent[definition.name] = registry.buildConfig(
        definition.name,
        router.resolveAgent(definition.name, definition.defaultCategory),
      )
    }

    config.command = {
      ...(config.command ?? {}),
      "start-work": {
        description: "Load the active Forge plan and start executing it",
        template:
          "Use the start_work tool to load the active Forge plan. If the user passed arguments, treat them as the plan name: $ARGUMENTS",
        agent: "pilot",
      },
    }
  }
}
