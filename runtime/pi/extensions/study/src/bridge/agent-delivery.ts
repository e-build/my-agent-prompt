import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Send immediately, falling back to a queued follow-up while the agent is busy. */
export function deliverToAgent(
  pi: Pick<ExtensionAPI, "sendUserMessage">,
  prompt: string,
  label: string,
): void {
  try {
    pi.sendUserMessage(prompt);
    return;
  } catch {
    // The agent may be streaming. Preserve the existing best-effort fallback.
  }
  try {
    pi.sendUserMessage(prompt, { deliverAs: "followUp" });
  } catch (error) {
    console.warn(`[study] failed to deliver ${label}:`, error);
  }
}
