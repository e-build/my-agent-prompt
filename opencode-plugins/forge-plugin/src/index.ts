import type { Plugin } from "@opencode-ai/plugin"
import { join } from "node:path"
import { homedir } from "node:os"
import { ensureUserConfigBootstrap } from "./config/bootstrap"
import { loadConfig } from "./config/loader"
import { createAgentRegistrar } from "./hooks/agent-registrar"
import { createEventLogger } from "./hooks/event-logger"
import { createModelRouter } from "./hooks/model-router"
import { createPlannerWriteGuard } from "./hooks/planner-write-guard"
import { createAgentModelResolver } from "./kernel/agent-model-resolver"
import { createAgentRegistry } from "./kernel/agent-registry"
import { bindModelsTool, recommendModelsTool } from "./tools/model-bindings"
import { startWorkTool } from "./tools/start-work"

const ForgePlugin: Plugin = async (ctx) => {
  await ensureUserConfigBootstrap(join(homedir(), ".config", "opencode", "forge-config.jsonc"))
  const config = await loadConfig(ctx.directory)
  const registry = createAgentRegistry(config)
  const resolver = createAgentModelResolver(config)
  const sessionAgents = new Map<string, string>()
  const plannerWriteGuard = createPlannerWriteGuard(ctx.directory, sessionAgents)

  return {
    tool: {
      bind_models: bindModelsTool,
      recommend_models: recommendModelsTool,
      start_work: startWorkTool,
    },
    config: createAgentRegistrar(registry, resolver, config),
    "chat.message": async (input, output) => {
      if (input.agent) {
        sessionAgents.set(input.sessionID, input.agent)
      }
      await createModelRouter(registry, resolver)(input, output)
    },
    "tool.execute.before": plannerWriteGuard,
    event: createEventLogger(),
  }
}

export default ForgePlugin
