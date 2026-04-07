import { describe, expect, test } from "bun:test"
import { createAgentRegistry } from "../kernel/agent-registry"
import { createCategoryRouter } from "../kernel/category-router"
import { createModelRouter } from "./model-router"

describe("createModelRouter", () => {
  test("routes worker using forge category variant override", async () => {
    const hook = createModelRouter(
      createAgentRegistry({
        categories: {
          deep: { model: "openai/gpt-5.4" },
          visual: { model: "google/gemini-3.1-pro" },
        },
      }),
      createCategoryRouter({
        categories: {
          deep: { model: "openai/gpt-5.4" },
          visual: { model: "google/gemini-3.1-pro" },
        },
      }),
    )

    const output = {
      message: {
        model: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-6",
        },
      },
    }

    await hook({ sessionID: "s1", agent: "worker", variant: "forge:deep" }, output)

    expect(output.message.model).toEqual({
      providerID: "openai",
      modelID: "gpt-5.4",
    })
  })

  test("routes forge agent messages to resolved model", async () => {
    const hook = createModelRouter(
      createAgentRegistry({
        agents: {
          pilot: { model: "openai/gpt-5.4" },
        },
      }),
      createCategoryRouter({
        agents: {
          pilot: { model: "openai/gpt-5.4" },
        },
      }),
    )

    const output = {
      message: {
        model: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-6",
        },
      },
    }

    await hook({ sessionID: "s1", agent: "pilot" }, output)

    expect(output.message.model).toEqual({
      providerID: "openai",
      modelID: "gpt-5.4",
    })
  })

  test("ignores unknown agents", async () => {
    const hook = createModelRouter(createAgentRegistry({}), createCategoryRouter({}))
    const output = {
      message: {
        model: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-6",
        },
      },
    }

    await hook({ sessionID: "s1", agent: "general" }, output)
    expect(output.message.model).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
    })
  })

  test("falls back to default category when variant is invalid", async () => {
    const hook = createModelRouter(createAgentRegistry({}), createCategoryRouter({}))
    const output = {
      message: {
        model: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-6",
        },
      },
    }

    await hook({ sessionID: "s1", agent: "worker", variant: "forge:unknown" }, output)

    expect(output.message.model).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
    })
  })
})
