import type { AgentConfig } from "@opencode-ai/sdk"
import { WORKER_PROMPT, withPromptAppend } from "./prompts"

export function createWorkerAgent(model: string, promptAppend?: string): AgentConfig {
  return {
    model,
    mode: "all",
    description: "Focused task executor that cannot delegate further",
    prompt: withPromptAppend(WORKER_PROMPT, promptAppend),
    permission: {
      edit: "allow",
      bash: "allow",
      webfetch: "allow",
      external_directory: "allow",
      task: "deny",
    } as AgentConfig["permission"],
  }
}
