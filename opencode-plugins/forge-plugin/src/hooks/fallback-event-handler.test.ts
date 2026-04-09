import { describe, expect, test } from "bun:test"
import { createFallbackState } from "./fallback-state"
import { createFallbackEventHandler } from "./fallback-event-handler"
import { createAgentModelResolver } from "../kernel/agent-model-resolver"
import { createAgentRegistry } from "../kernel/agent-registry"

describe("createFallbackEventHandler", () => {
  test("arms fallback and dispatches retry on retryable session error", async () => {
    const fallbackState = createFallbackState()
    const sessionAgents = new Map([["s1", "worker"]])
    const registry = createAgentRegistry({})
    const resolver = createAgentModelResolver({
      agents: {
        worker: {
          fallback_models: ["openai/gpt-5.4", "openai/gpt-5-mini"],
        },
      },
    })
    const context = createContext()

    const handler = createFallbackEventHandler(
      registry,
      resolver,
      fallbackState,
      sessionAgents,
      context,
    )

    await handler({
      event: {
        type: "session.error",
        properties: {
          sessionID: "s1",
          error: { statusCode: 503 },
        },
      },
    })

    expect(fallbackState.peek("s1")).toEqual({
      agent: "worker",
      attempt: 1,
        model: "openai/gpt-5.4",
      })
    expect(context.promptAsyncCalls).toHaveLength(1)
    expect(context.promptAsyncCalls[0]).toEqual({
      path: { id: "s1" },
      body: {
        agent: "worker",
        model: {
          providerID: "openai",
          modelID: "gpt-5.4",
        },
        parts: [{ type: "text", text: "Retry this" }],
      },
      query: { directory: "/repo" },
    })
  })

  test("does not arm fallback for non-retryable errors", async () => {
    const fallbackState = createFallbackState()
    const sessionAgents = new Map([["s1", "worker"]])
    const context = createContext()
    const handler = createFallbackEventHandler(
      createAgentRegistry({}),
      createAgentModelResolver({
        agents: {
          worker: {
            fallback_models: ["openai/gpt-5.4"],
          },
        },
      }),
      fallbackState,
      sessionAgents,
      context,
    )

    await handler({
      event: {
        type: "session.error",
        properties: {
          sessionID: "s1",
          error: new Error("missing API key"),
        },
      },
    })

    expect(fallbackState.peek("s1")).toBeUndefined()
    expect(context.promptAsyncCalls).toHaveLength(0)
  })

  test("clears fallback state and session agent on lifecycle cleanup", async () => {
    const fallbackState = createFallbackState()
    const sessionAgents = new Map([["s1", "worker"]])
    const context = createContext()
    const handler = createFallbackEventHandler(
      createAgentRegistry({}),
      createAgentModelResolver({
        agents: {
          worker: {
            fallback_models: ["openai/gpt-5.4"],
          },
        },
      }),
      fallbackState,
      sessionAgents,
      context,
    )

    fallbackState.arm("s1", "worker", ["openai/gpt-5.4"])

    await handler({ event: { type: "session.idle", properties: { sessionID: "s1" } } })
    expect(fallbackState.peek("s1")).toBeUndefined()

    fallbackState.arm("s1", "worker", ["openai/gpt-5.4"])
    await handler({ event: { type: "session.deleted", properties: { info: { id: "s1" } } } })
    expect(fallbackState.peek("s1")).toBeUndefined()
    expect(sessionAgents.has("s1")).toBe(false)
  })

  test("keeps the next fallback in the chain on repeated retryable errors", async () => {
    const fallbackState = createFallbackState()
    const sessionAgents = new Map([["s1", "worker"]])
    const context = createContext()
    const handler = createFallbackEventHandler(
      createAgentRegistry({}),
      createAgentModelResolver({
        agents: {
          worker: {
            fallback_models: ["openai/gpt-5.4", "openai/gpt-5-mini"],
          },
        },
      }),
      fallbackState,
      sessionAgents,
      context,
    )

    fallbackState.arm("s1", "worker", ["openai/gpt-5.4", "openai/gpt-5-mini"])
    expect(fallbackState.consume("s1")).toEqual({
      agent: "worker",
      attempt: 1,
      model: "openai/gpt-5.4",
    })

    await handler({
      event: {
        type: "session.error",
        properties: {
          sessionID: "s1",
          error: { statusCode: 503 },
        },
      },
    })

    expect(fallbackState.peek("s1")).toEqual({
      agent: "worker",
      attempt: 2,
      model: "openai/gpt-5-mini",
    })
    expect(context.promptAsyncCalls).toHaveLength(1)
    expect(context.promptAsyncCalls[0]?.body).toEqual({
      agent: "worker",
      model: {
        providerID: "openai",
        modelID: "gpt-5-mini",
      },
      parts: [{ type: "text", text: "Retry this" }],
    })
  })

  test("does not dispatch retry when the last user message has no text parts", async () => {
    const fallbackState = createFallbackState()
    const sessionAgents = new Map([["s1", "worker"]])
    const context = createContext([
      {
        info: { role: "user" },
        parts: [{ type: "file" }],
      },
    ])
    const handler = createFallbackEventHandler(
      createAgentRegistry({}),
      createAgentModelResolver({
        agents: {
          worker: {
            fallback_models: ["openai/gpt-5.4"],
          },
        },
      }),
      fallbackState,
      sessionAgents,
      context,
    )

    await handler({
      event: {
        type: "session.error",
        properties: {
          sessionID: "s1",
          error: { statusCode: 503 },
        },
      },
    })

    expect(context.promptAsyncCalls).toHaveLength(0)
    expect(fallbackState.peek("s1")).toEqual({
      agent: "worker",
      attempt: 1,
      model: "openai/gpt-5.4",
    })
  })
})

function createContext(messages = [{ info: { role: "user" }, parts: [{ type: "text", text: "Retry this" }] }]) {
  const promptAsyncCalls: Array<{
    path: { id: string }
    body: {
      agent?: string
      model?: { providerID: string; modelID: string }
      parts: Array<{ type: string; text?: string }>
    }
    query: { directory: string }
  }> = []

  return {
    directory: "/repo",
    promptAsyncCalls,
    client: {
      session: {
        async messages() {
          return messages
        },
        async promptAsync(input: {
          path: { id: string }
          body: {
            agent?: string
            model?: { providerID: string; modelID: string }
            parts: Array<{ type: string; text?: string }>
          }
          query: { directory: string }
        }) {
          promptAsyncCalls.push(input)
        },
      },
    },
  }
}
