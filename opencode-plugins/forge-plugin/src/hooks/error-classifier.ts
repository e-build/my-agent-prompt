const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])
const RETRYABLE_MESSAGE_PATTERNS = [
  /etimedout/i,
  /timeout/i,
  /timed out/i,
  /temporary unavailable/i,
  /connection reset/i,
  /network error/i,
  /econnreset/i,
  /service unavailable/i,
]
const NON_RETRYABLE_MESSAGE_PATTERNS = [
  /missing api key/i,
  /api key/i,
  /model not found/i,
  /unauthorized/i,
  /forbidden/i,
  /authentication/i,
]

function getMessage(error: unknown): string {
  if (!error) {
    return ""
  }

  if (typeof error === "string") {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>
    const messageCandidates = [
      record.message,
      (record.error as Record<string, unknown> | undefined)?.message,
      (record.data as Record<string, unknown> | undefined)?.message,
    ]
    const message = messageCandidates.find((value): value is string => typeof value === "string")
    return message ?? ""
  }

  return ""
}

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined
  }

  const record = error as Record<string, unknown>
  const status = [
    record.statusCode,
    record.status,
    (record.error as Record<string, unknown> | undefined)?.statusCode,
    (record.data as Record<string, unknown> | undefined)?.statusCode,
  ].find((value): value is number => typeof value === "number")

  return status
}

export function isRetryableApiError(error: unknown): boolean {
  const statusCode = getStatusCode(error)
  if (statusCode !== undefined) {
    return RETRYABLE_STATUS_CODES.has(statusCode)
  }

  const message = getMessage(error)
  if (!message) {
    return false
  }

  if (NON_RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return false
  }

  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}
