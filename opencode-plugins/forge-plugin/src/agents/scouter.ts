import type { AgentConfig } from "@opencode-ai/sdk"
import { SCOUTER_PROMPT, withPromptAppend } from "./prompts"

export function createScouterAgent(model: string, promptAppend?: string): AgentConfig {
  return {
    model,
    mode: "all",
    description: "Fast read-only codebase explorer",
    prompt: withPromptAppend(SCOUTER_PROMPT, promptAppend),
    permission: {
      edit: "deny",
      bash: "deny",
      webfetch: "deny",
      external_directory: "deny",
      task: "deny",
    } as AgentConfig["permission"],
  }
}
