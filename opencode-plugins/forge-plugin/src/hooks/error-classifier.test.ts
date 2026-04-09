import { describe, expect, test } from "bun:test"
import { isRetryableApiError } from "./error-classifier"

describe("isRetryableApiError", () => {
  test("retries common transient status codes", () => {
    expect(isRetryableApiError({ statusCode: 429 })).toBe(true)
    expect(isRetryableApiError({ status: 503 })).toBe(true)
    expect(isRetryableApiError({ data: { statusCode: 500 } })).toBe(true)
  })

  test("retries common transient network failures", () => {
    expect(isRetryableApiError(new Error("ETIMEDOUT while calling provider"))).toBe(true)
    expect(isRetryableApiError(new Error("temporary unavailable"))).toBe(true)
  })

  test("does not retry configuration and auth failures", () => {
    expect(isRetryableApiError(new Error("missing API key"))).toBe(false)
    expect(isRetryableApiError(new Error("model not found"))).toBe(false)
    expect(isRetryableApiError({ statusCode: 401 })).toBe(false)
  })
})
