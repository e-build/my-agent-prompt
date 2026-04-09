import type { ForgeConfig } from "../config/schema"
import type { AgentModelRoute, AgentName, ModelRef } from "./types"
import { parseModelString } from "./types"

const DEFAULT_AGENT_MODELS: Record<AgentName, string> = {
  pilot: "anthropic/claude-sonnet-4-6",
  planner: "openai/gpt-5.4",
  architect: "openai/gpt-5.4",
  worker: "anthropic/claude-sonnet-4-6",
  scouter: "anthropic/claude-haiku-4-5",
  researcher: "openai/gpt-5.4",
}

export interface AgentModelResolver {
  resolveAgentModel(agent: AgentName): string
  resolveAgentRoute(agent: AgentName): AgentModelRoute
  parse(model: string): ModelRef
}

export function createAgentModelResolver(config: ForgeConfig): AgentModelResolver {
  return {
    resolveAgentModel(agent) {
      return this.resolveAgentRoute(agent).model
    },
    resolveAgentRoute(agent) {
      return {
        model: config.agents?.[agent]?.model ?? DEFAULT_AGENT_MODELS[agent],
        fallbackModels: config.agents?.[agent]?.fallback_models ?? [],
      }
    },
    parse(model) {
      return parseModelString(model)
    },
  }
}

export { DEFAULT_AGENT_MODELS }
