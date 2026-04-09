import type { ForgeConfig } from "../config/schema"
import type { AgentName, ModelRef } from "./types"
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
  parse(model: string): ModelRef
}

export function createAgentModelResolver(config: ForgeConfig): AgentModelResolver {
  return {
    resolveAgentModel(agent) {
      return config.agents?.[agent]?.model ?? DEFAULT_AGENT_MODELS[agent]
    },
    parse(model) {
      return parseModelString(model)
    },
  }
}

export { DEFAULT_AGENT_MODELS }
