import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "./config/loader"
import { createAgentRegistrar } from "./hooks/agent-registrar"
import { createEventLogger } from "./hooks/event-logger"
import { createModelRouter } from "./hooks/model-router"
import { createCategoryRouter } from "./kernel/category-router"
import { createAgentRegistry } from "./kernel/agent-registry"
import { startWorkTool } from "./tools/start-work"

const ForgePlugin: Plugin = async (ctx) => {
  const config = await loadConfig(ctx.directory)
  const registry = createAgentRegistry(config)
  const router = createCategoryRouter(config)

  return {
    tool: {
      start_work: startWorkTool,
    },
    config: createAgentRegistrar(registry, router),
    "chat.message": createModelRouter(registry, router),
    event: createEventLogger(),
  }
}

export default ForgePlugin
