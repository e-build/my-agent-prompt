import type { AgentRegistry } from "../kernel/agent-registry"
import type { AgentModelResolver } from "../kernel/agent-model-resolver"
import type { FallbackStateStore } from "./fallback-state"

export function createModelRouter(
  registry: AgentRegistry,
  resolver: AgentModelResolver,
  fallbackState?: FallbackStateStore,
) {
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

    const pendingFallback = fallbackState?.consume(input.sessionID, input.agent)
    const model = pendingFallback?.model ?? resolver.resolveAgentModel(input.agent)
    output.message.model = resolver.parse(model)
  }
}
