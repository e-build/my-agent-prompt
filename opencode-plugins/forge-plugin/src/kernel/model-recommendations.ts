import type { ForgeConfig } from "../config/schema"
import type { AgentName } from "./types"
import { DEFAULT_AGENT_MODELS } from "./agent-model-resolver"

const AGENTS: AgentName[] = ["pilot", "planner", "architect", "worker", "scouter", "researcher"]

const PREFERENCES: Record<AgentName, string[]> = {
  pilot: ["gpt-5.4", "claude-sonnet", "gpt-5.2"],
  planner: ["gpt-5.4", "gpt-5.3", "claude-opus", "claude-sonnet"],
  architect: ["gpt-5.4", "gpt-5.3", "claude-opus", "claude-sonnet"],
  worker: ["claude-sonnet", "gpt-5-codex", "gpt-5.4", "gpt-4.1"],
  scouter: ["claude-haiku", "gemini", "flash", "gpt-5-mini", "gpt-4o-mini"],
  researcher: ["gpt-5.4", "gpt-5.3", "claude-opus", "gemini", "gpt-4.1"],
}

const REASONS: Record<AgentName, string> = {
  pilot: "main orchestration benefits from a strong general coding model",
  planner: "planning benefits from the strongest reasoning model available",
  architect: "architecture trade-off analysis benefits from deep reasoning",
  worker: "implementation benefits from a reliable coding model",
  scouter: "codebase exploration benefits from a fast and lighter model",
  researcher: "external research benefits from a strong reasoning model with good web synthesis",
}

export interface AgentModelRecommendation {
  agent: AgentName
  currentModel: string
  recommendedModel: string
  reason: string
}

export function parseModelList(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[^\s/]+\/.+/.test(line))
}

export function recommendAgentModels(
  models: string[],
  config: ForgeConfig,
): AgentModelRecommendation[] {
  const candidates = models.filter(isDefaultCandidate)

  return AGENTS.map((agent) => {
    const currentModel = config.agents?.[agent]?.model ?? DEFAULT_AGENT_MODELS[agent]

    return {
      agent,
      currentModel,
      recommendedModel: chooseModel(agent, candidates) ?? currentModel,
      reason: REASONS[agent],
    }
  })
}

export function applyAgentModelBindings(
  config: ForgeConfig,
  recommendations: AgentModelRecommendation[],
): ForgeConfig {
  const agents = { ...(config.agents ?? {}) }

  for (const recommendation of recommendations) {
    agents[recommendation.agent] = {
      ...agents[recommendation.agent],
      model: recommendation.recommendedModel,
    }
  }

  return {
    ...config,
    agents,
  }
}

export function formatRecommendations(recommendations: AgentModelRecommendation[]): string {
  return [
    "# Forge model recommendations",
    "",
    ...recommendations.flatMap((recommendation) => [
      `## ${recommendation.agent}`,
      `current: ${recommendation.currentModel}`,
      `recommended: ${recommendation.recommendedModel}`,
      `reason: ${recommendation.reason}`,
      "",
    ]),
    "Approve binding before writing these recommendations to .forge/config.jsonc.",
  ].join("\n")
}

function chooseModel(agent: AgentName, models: string[]): string | undefined {
  const preferences = PREFERENCES[agent]

  for (const preference of preferences) {
    const match = models.find((model) => model.toLowerCase().includes(preference))
    if (match) {
      return match
    }
  }

  return undefined
}

function isDefaultCandidate(model: string): boolean {
  const lowered = model.toLowerCase()
  return (
    !lowered.includes("free") &&
    !lowered.includes("preview") &&
    !lowered.includes("embedding")
  )
}
