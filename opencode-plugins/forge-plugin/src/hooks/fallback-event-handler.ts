import type { AgentModelResolver } from "../kernel/agent-model-resolver"
import type { AgentRegistry } from "../kernel/agent-registry"
import type { AgentName } from "../kernel/types"
import { isRetryableApiError } from "./error-classifier"
import type { FallbackStateStore } from "./fallback-state"

interface RetryContext {
  directory: string
  client: {
    session: {
      messages(input: {
        path: { id: string }
        query: { directory: string }
      }): Promise<
        | Array<{ info: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>
        | {
            data?: Array<{
              info: { role?: string }
              parts?: Array<{ type?: string; text?: string }>
            }>
          }
      >
      promptAsync(input: {
        path: { id: string }
        body: {
          agent?: string
          model?: {
            providerID: string
            modelID: string
          }
          parts: Array<{ type: "text"; text: string }>
        }
        query: { directory: string }
      }): Promise<unknown>
    }
  }
}

async function getLastUserTextParts(context: RetryContext, sessionID: string) {
  const messagesResult = await context.client.session.messages({
    path: { id: sessionID },
    query: { directory: context.directory },
  })
  const messages = Array.isArray(messagesResult) ? messagesResult : (messagesResult.data ?? [])
  const lastUserMessage = messages.filter((message) => message.info?.role === "user").pop()

  return (lastUserMessage?.parts ?? [])
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string" && part.text.length > 0,
    )
    .map((part) => ({ type: "text" as const, text: part.text }))
}

export function createFallbackEventHandler(
  registry: AgentRegistry,
  resolver: AgentModelResolver,
  fallbackState: FallbackStateStore,
  sessionAgents: Map<string, string>,
  context?: RetryContext,
) {
  return async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const properties = (event.properties ?? {}) as {
      sessionID?: string
      error?: unknown
      info?: { id?: string }
    }
    const sessionID = properties.sessionID ?? properties.info?.id

    if (!sessionID) {
      return
    }

    if (event.type === "session.idle") {
      fallbackState.clear(sessionID)
      return
    }

    if (event.type === "session.stop" || event.type === "session.deleted") {
      fallbackState.clear(sessionID)
      sessionAgents.delete(sessionID)
      return
    }

    if (event.type !== "session.error") {
      return
    }

    const agent = sessionAgents.get(sessionID)
    if (!registry.isForgeAgent(agent) || registry.isDisabled(agent)) {
      return
    }

    if (!isRetryableApiError(properties.error)) {
      return
    }

    const route = resolver.resolveAgentRoute(agent as AgentName)
    const pendingFallback = fallbackState.peek(sessionID, agent)
    if (pendingFallback) {
      if (context) {
        const retryParts = await getLastUserTextParts(context, sessionID)
        if (retryParts.length > 0) {
          await context.client.session.promptAsync({
            path: { id: sessionID },
            body: {
              agent,
              model: resolver.parse(pendingFallback.model),
              parts: retryParts,
            },
            query: { directory: context.directory },
          })
        }
      }
      return
    }

    fallbackState.arm(sessionID, agent, route.fallbackModels)
    const armedFallback = fallbackState.peek(sessionID, agent)

    if (!context || !armedFallback) {
      return
    }

    const retryParts = await getLastUserTextParts(context, sessionID)
    if (retryParts.length === 0) {
      return
    }

    await context.client.session.promptAsync({
      path: { id: sessionID },
      body: {
        agent,
        model: resolver.parse(armedFallback.model),
        parts: retryParts,
      },
      query: { directory: context.directory },
    })
  }
}
