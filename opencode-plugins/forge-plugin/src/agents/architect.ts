import type { AgentConfig } from "@opencode-ai/sdk"
import { ARCHITECT_PROMPT, withPromptAppend } from "./prompts"

export function createArchitectAgent(model: string, promptAppend?: string): AgentConfig {
  return {
    model,
    mode: "subagent",
    description: "Read-only architecture consultant",
    prompt: withPromptAppend(ARCHITECT_PROMPT, promptAppend),
    permission: {
      edit: "deny",
      bash: "deny",
      webfetch: "deny",
      external_directory: "deny",
      task: {
        "*": "deny",
        scouter: "allow",
        researcher: "allow",
      },
    } as AgentConfig["permission"],
  }
}
