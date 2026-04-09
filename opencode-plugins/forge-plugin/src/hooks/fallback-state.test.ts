import { describe, expect, test } from "bun:test"
import { createFallbackState } from "./fallback-state"

describe("createFallbackState", () => {
  test("arms and consumes fallback models in order", () => {
    const state = createFallbackState()

    state.arm("s1", "worker", ["openai/gpt-5.4", "openai/gpt-5-mini"])

    expect(state.peek("s1")).toEqual({
      agent: "worker",
      attempt: 1,
      model: "openai/gpt-5.4",
    })

    expect(state.consume("s1")).toEqual({
      agent: "worker",
      attempt: 1,
      model: "openai/gpt-5.4",
    })

    expect(state.peek("s1")).toEqual({
      agent: "worker",
      attempt: 2,
      model: "openai/gpt-5-mini",
    })
  })

  test("clears exhausted fallback chains", () => {
    const state = createFallbackState()

    state.arm("s1", "worker", ["openai/gpt-5.4"])

    expect(state.consume("s1")).toEqual({
      agent: "worker",
      attempt: 1,
      model: "openai/gpt-5.4",
    })
    expect(state.peek("s1")).toBeUndefined()
  })

  test("ignores empty fallback chains", () => {
    const state = createFallbackState()

    state.arm("s1", "worker", [])

    expect(state.peek("s1")).toBeUndefined()
  })

  test("can clear state explicitly", () => {
    const state = createFallbackState()

    state.arm("s1", "worker", ["openai/gpt-5.4"])
    state.clear("s1")

    expect(state.peek("s1")).toBeUndefined()
  })
})
