import type { AgentRegistry } from "../kernel/agent-registry"
import type { CategoryRouter } from "../kernel/category-router"

const FORGE_VARIANT_PREFIX = "forge:"

function parseForgeCategory(variant?: string): "quick" | "standard" | "deep" | "visual" | undefined {
  if (!variant?.startsWith(FORGE_VARIANT_PREFIX)) {
    return undefined
  }

  const category = variant.slice(FORGE_VARIANT_PREFIX.length)
  if (
    category === "quick" ||
    category === "standard" ||
    category === "deep" ||
    category === "visual"
  ) {
    return category
  }

  return undefined
}

export function createModelRouter(registry: AgentRegistry, router: CategoryRouter) {
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

    const category = parseForgeCategory(input.variant) ?? registry.getDefaultCategory(input.agent)
    output.message.model = router.parse(router.resolveAgent(input.agent, category))
  }
}
