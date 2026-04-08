import { describe, expect, test } from "bun:test"
import {
  applyAgentModelBindings,
  parseModelList,
  recommendAgentModels,
} from "./model-recommendations"

describe("parseModelList", () => {
  test("parses model ids from opencode models output", () => {
    expect(
      parseModelList(`
cp-openai/gpt-5.4
cp-github-copilot/claude-sonnet-4.6

`),
    ).toEqual(["cp-openai/gpt-5.4", "cp-github-copilot/claude-sonnet-4.6"])
  })
})

describe("recommendAgentModels", () => {
  test("recommends available models by agent role", () => {
    const recommendations = recommendAgentModels(
      [
        "cp-openai/gpt-5.4",
        "cp-github-copilot/claude-sonnet-4.6",
        "cp-github-copilot/claude-haiku-4.5",
      ],
      {},
    )

    expect(recommendations.map((item) => [item.agent, item.recommendedModel])).toEqual([
      ["pilot", "cp-openai/gpt-5.4"],
      ["planner", "cp-openai/gpt-5.4"],
      ["architect", "cp-openai/gpt-5.4"],
      ["worker", "cp-github-copilot/claude-sonnet-4.6"],
      ["scouter", "cp-github-copilot/claude-haiku-4.5"],
    ])
  })

  test("ignores free preview and embedding models for default recommendations", () => {
    const recommendations = recommendAgentModels(
      [
        "cp-github-copilot/goldeneye-free-auto",
        "cp-github-copilot/gemini-3.1-pro-preview",
        "cp-github-copilot/text-embedding-3-small",
      ],
      {},
    )

    expect(recommendations.every((item) => item.recommendedModel === item.currentModel)).toBe(
      true,
    )
  })
})

describe("applyAgentModelBindings", () => {
  test("merges recommended models while preserving agent prompt append and disabled agents", () => {
    const result = applyAgentModelBindings(
      {
        disabled_agents: ["architect"],
        agents: {
          worker: { prompt_append: "Be concise." },
        },
      },
      [
        {
          agent: "worker",
          currentModel: "anthropic/claude-sonnet-4-6",
          recommendedModel: "cp-github-copilot/claude-sonnet-4.6",
          reason: "coding model",
        },
      ],
    )

    expect(result.disabled_agents).toEqual(["architect"])
    expect(result.agents?.worker).toEqual({
      model: "cp-github-copilot/claude-sonnet-4.6",
      prompt_append: "Be concise.",
    })
  })
})
