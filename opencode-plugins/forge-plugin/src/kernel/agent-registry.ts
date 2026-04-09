import type { AgentConfig } from "@opencode-ai/sdk"
import type { ForgeConfig } from "../config/schema"
import { createArchitectAgent } from "../agents/architect"
import { createPilotAgent } from "../agents/pilot"
import { createPlannerAgent } from "../agents/planner"
import { createResearcherAgent } from "../agents/researcher"
import { createScouterAgent } from "../agents/scouter"
import { createWorkerAgent } from "../agents/worker"
import type { AgentDefinition, AgentName } from "./types"

const DEFINITIONS: AgentDefinition[] = [
  {
    name: "pilot",
    delegatesTo: ["worker", "scouter", "architect", "researcher"],
    createConfig: createPilotAgent,
  },
  {
    name: "planner",
    delegatesTo: ["scouter", "architect", "researcher"],
    createConfig: createPlannerAgent,
  },
  {
    name: "architect",
    delegatesTo: ["scouter", "researcher"],
    createConfig: createArchitectAgent,
  },
  {
    name: "worker",
    delegatesTo: [],
    createConfig: createWorkerAgent,
  },
  {
    name: "scouter",
    delegatesTo: [],
    createConfig: createScouterAgent,
  },
  {
    name: "researcher",
    delegatesTo: [],
    createConfig: createResearcherAgent,
  },
]

export interface AgentRegistry {
  getAll(): AgentDefinition[]
  getActive(): AgentDefinition[]
  isForgeAgent(name?: string): name is AgentName
  isDisabled(name: AgentName): boolean
  canDelegate(from: AgentName, to: AgentName): boolean
  buildConfig(name: AgentName, model: string): AgentConfig
}

export function createAgentRegistry(config: ForgeConfig): AgentRegistry {
  const disabled = new Set(config.disabled_agents ?? [])

  return {
    getAll() {
      return DEFINITIONS
    },
    getActive() {
      return DEFINITIONS.filter((definition) => !this.isDisabled(definition.name))
    },
    isForgeAgent(name): name is AgentName {
      return DEFINITIONS.some((definition) => definition.name === name)
    },
    isDisabled(name) {
      return name !== "pilot" && disabled.has(name)
    },
    canDelegate(from, to) {
      return getDefinition(from).delegatesTo.includes(to)
    },
    buildConfig(name, model) {
      const definition = getDefinition(name)
      return definition.createConfig(model, config.agents?.[name]?.prompt_append)
    },
  }
}

function getDefinition(name: AgentName): AgentDefinition {
  const definition = DEFINITIONS.find((item) => item.name === name)
  if (!definition) {
    throw new Error(`Unknown Forge agent: ${name}`)
  }

  return definition
}
