import type { AgentConfig } from "@opencode-ai/sdk"

export type AgentName =
  | "pilot"
  | "planner"
  | "architect"
  | "worker"
  | "scouter"
  | "researcher"

export interface ModelRef {
  providerID: string
  modelID: string
}

export interface AgentModelRoute {
  model: string
  fallbackModels: string[]
}

export interface AgentDefinition {
  name: AgentName
  delegatesTo: AgentName[]
  createConfig(model: string, promptAppend?: string): AgentConfig
}

export function parseModelString(model: string): ModelRef {
  const [providerID, ...rest] = model.split("/")
  if (!providerID || rest.length === 0) {
    throw new Error(`Invalid model string: ${model}`)
  }

  return {
    providerID,
    modelID: rest.join("/"),
  }
}
