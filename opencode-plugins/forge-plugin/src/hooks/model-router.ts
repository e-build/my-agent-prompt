import type { AgentRegistry } from "../kernel/agent-registry"
import type { CategoryRouter } from "../kernel/category-router"

export function createModelRouter(registry: AgentRegistry, router: CategoryRouter) {
  return async (
    input: {
      sessionID: string
      agent?: string
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

    const category = registry.getDefaultCategory(input.agent)
    output.message.model = router.parse(router.resolveAgent(input.agent, category))
  }
}
