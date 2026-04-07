import type { ForgeConfig } from "../config/schema"
import type { AgentName, Category, ModelRef } from "./types"
import { parseModelString } from "./types"

const DEFAULT_MODELS: Record<Category, string> = {
  quick: "anthropic/claude-haiku-4-5",
  standard: "anthropic/claude-sonnet-4-6",
  deep: "openai/gpt-5.4",
  visual: "google/gemini-3.1-pro",
}

export interface CategoryRouter {
  resolveCategory(category: Category): string
  resolveAgent(agent: AgentName, category: Category): string
  parse(model: string): ModelRef
}

export function createCategoryRouter(config: ForgeConfig): CategoryRouter {
  return {
    resolveCategory(category) {
      return config.categories?.[category]?.model ?? DEFAULT_MODELS[category]
    },
    resolveAgent(agent, category) {
      return config.agents?.[agent]?.model ?? this.resolveCategory(category)
    },
    parse(model) {
      return parseModelString(model)
    },
  }
}

export { DEFAULT_MODELS }
