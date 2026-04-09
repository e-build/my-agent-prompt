import type { AgentName } from "../kernel/types"

interface PendingFallbackState {
  agent: AgentName
  models: string[]
  index: number
}

interface PendingFallback {
  agent: AgentName
  attempt: number
  model: string
}

export interface FallbackStateStore {
  arm(sessionID: string, agent: AgentName, models: string[]): void
  peek(sessionID: string, agent?: AgentName): PendingFallback | undefined
  consume(sessionID: string, agent?: AgentName): PendingFallback | undefined
  clear(sessionID: string): void
}

export function createFallbackState(): FallbackStateStore {
  const states = new Map<string, PendingFallbackState>()

  const toPendingFallback = (state: PendingFallbackState | undefined): PendingFallback | undefined => {
    if (!state) {
      return undefined
    }

    const model = state.models[state.index]
    if (!model) {
      return undefined
    }

    return {
      agent: state.agent,
      attempt: state.index + 1,
      model,
    }
  }

  return {
    arm(sessionID, agent, models) {
      const filtered = models.filter(Boolean)
      if (filtered.length === 0) {
        states.delete(sessionID)
        return
      }

      states.set(sessionID, {
        agent,
        models: filtered,
        index: 0,
      })
    },
    peek(sessionID, agent) {
      const state = states.get(sessionID)
      if (agent && state?.agent !== agent) {
        return undefined
      }

      return toPendingFallback(state)
    },
    consume(sessionID, agent) {
      const state = states.get(sessionID)
      if (agent && state?.agent !== agent) {
        return undefined
      }

      const fallback = toPendingFallback(state)
      if (!state || !fallback) {
        return undefined
      }

      state.index += 1
      if (state.index >= state.models.length) {
        states.delete(sessionID)
      }

      return fallback
    },
    clear(sessionID) {
      states.delete(sessionID)
    },
  }
}
