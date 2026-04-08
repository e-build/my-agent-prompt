import type { AgentRegistry } from "../kernel/agent-registry"
import type { AgentModelResolver } from "../kernel/agent-model-resolver"

export function createModelRouter(registry: AgentRegistry, resolver: AgentModelResolver) {
  return async (
    input: {
      sessionID: string
      agent?: string
      variant?: string
    },
    output: {
      message: {
        model: {
          providerID: string
          modelID: string
        }
      }
    },
  ) => {
    if (!registry.isForgeAgent(input.agent)) {
      return
    }

    if (registry.isDisabled(input.agent)) {
      return
    }

    output.message.model = resolver.parse(resolver.resolveAgentModel(input.agent))
  }
}
