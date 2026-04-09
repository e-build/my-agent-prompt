import { describe, expect, test } from "bun:test"
import { createAgentRegistry } from "../kernel/agent-registry"
import { createAgentModelResolver } from "../kernel/agent-model-resolver"
import { createFallbackState } from "./fallback-state"
import { createModelRouter } from "./model-router"

describe("createModelRouter", () => {
  test("routes forge agent messages to resolved model", async () => {
    const hook = createModelRouter(
      createAgentRegistry({
        agents: {
          pilot: { model: "openai/gpt-5.4" },
        },
      }),
      createAgentModelResolver({
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
    const hook = createModelRouter(createAgentRegistry({}), createAgentModelResolver({}))
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

  test("ignores forge category variants and uses the agent model", async () => {
    const hook = createModelRouter(createAgentRegistry({}), createAgentModelResolver({}))
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
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
    })
  })

  test("prefers pending fallback model over primary agent model", async () => {
    const fallbackState = createFallbackState()
    fallbackState.arm("s1", "worker", ["openai/gpt-5.4"])

    const hook = createModelRouter(
      createAgentRegistry({}),
      createAgentModelResolver({
        agents: {
          worker: {
            model: "anthropic/claude-sonnet-4-6",
            fallback_models: ["openai/gpt-5.4"],
          },
        },
      }),
      fallbackState,
    )
    const output = {
      message: {
        model: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-6",
        },
      },
    }

    await hook({ sessionID: "s1", agent: "worker" }, output)

    expect(output.message.model).toEqual({
      providerID: "openai",
      modelID: "gpt-5.4",
    })
    expect(fallbackState.peek("s1")).toBeUndefined()
  })

  test("does not consume fallback armed for a different agent", async () => {
    const fallbackState = createFallbackState()
    fallbackState.arm("s1", "architect", ["openai/gpt-5.4"])

    const hook = createModelRouter(
      createAgentRegistry({}),
      createAgentModelResolver({
        agents: {
          worker: {
            model: "anthropic/claude-sonnet-4-6",
          },
        },
      }),
      fallbackState,
    )
    const output = {
      message: {
        model: {
          providerID: "openai",
          modelID: "gpt-4.1",
        },
      },
    }

    await hook({ sessionID: "s1", agent: "worker" }, output)

    expect(output.message.model).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
    })
    expect(fallbackState.peek("s1")).toEqual({
      agent: "architect",
      attempt: 1,
      model: "openai/gpt-5.4",
    })
  })
})
