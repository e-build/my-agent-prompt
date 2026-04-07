export function createEventLogger() {
  return async ({ event }: { event: { type: string } }) => {
    if (
      event.type === "session.created" ||
      event.type === "session.idle" ||
      event.type === "command.executed" ||
      event.type === "session.error"
    ) {
      console.log(`[forge] ${event.type}`)
    }
  }
}
