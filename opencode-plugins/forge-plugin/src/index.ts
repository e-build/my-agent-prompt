import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "./config/loader"
import { createAgentRegistrar } from "./hooks/agent-registrar"
import { createEventLogger } from "./hooks/event-logger"
import { createModelRouter } from "./hooks/model-router"
import { createPlannerWriteGuard } from "./hooks/planner-write-guard"
import { createCategoryRouter } from "./kernel/category-router"
import { createAgentRegistry } from "./kernel/agent-registry"
import { startWorkTool } from "./tools/start-work"

const ForgePlugin: Plugin = async (ctx) => {
  const config = await loadConfig(ctx.directory)
  const registry = createAgentRegistry(config)
  const router = createCategoryRouter(config)
  const sessionAgents = new Map<string, string>()
  const plannerWriteGuard = createPlannerWriteGuard(ctx.directory, sessionAgents)

  return {
    tool: {
      start_work: startWorkTool,
    },
    config: createAgentRegistrar(registry, router),
    "chat.message": async (input, output) => {
      if (input.agent) {
        sessionAgents.set(input.sessionID, input.agent)
      }
      await createModelRouter(registry, router)(input, output)
    },
    "tool.execute.before": plannerWriteGuard,
    event: createEventLogger(),
  }
}

export default ForgePlugin
