import type { AgentConfig } from "@opencode-ai/sdk"
import { ARCHITECT_PROMPT, withPromptAppend } from "./prompts"

export function createArchitectAgent(model: string, promptAppend?: string): AgentConfig {
  return {
    model,
    mode: "all",
    description: "Read-only architecture consultant",
    prompt: withPromptAppend(ARCHITECT_PROMPT, promptAppend),
    permission: {
      edit: "deny",
      bash: "deny",
      webfetch: "deny",
      external_directory: "deny",
      task: "allow",
    } as AgentConfig["permission"],
  }
}
