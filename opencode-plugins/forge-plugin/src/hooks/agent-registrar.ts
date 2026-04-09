import type { Config } from "@opencode-ai/plugin"
import type { ForgeConfig } from "../config/schema"
import type { AgentRegistry } from "../kernel/agent-registry"
import type { AgentModelResolver } from "../kernel/agent-model-resolver"

const BUILTIN_OPENCODE_AGENTS = ["build", "plan", "general", "explore"] as const

export function createAgentRegistrar(
  registry: AgentRegistry,
  resolver: AgentModelResolver,
  forgeConfig?: ForgeConfig,
) {
  return async (config: Config) => {
    config.agent = {
      ...(config.agent ?? {}),
    }

    if (forgeConfig?.disable_builtin_agents) {
      for (const agentName of BUILTIN_OPENCODE_AGENTS) {
        config.agent[agentName] = {
          ...(config.agent[agentName] ?? {}),
          disable: true,
        }
      }
    }

    for (const definition of registry.getActive()) {
      config.agent[definition.name] = registry.buildConfig(
        definition.name,
        resolver.resolveAgentModel(definition.name),
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
      "forge-models": {
        description: "Recommend Forge agent models from available OpenCode models",
        template:
          "Use the recommend_models tool to show recommended Forge agent model bindings for the current project.",
        agent: "pilot",
      },
    }
  }
}
