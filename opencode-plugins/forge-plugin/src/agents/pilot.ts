import type { AgentConfig } from "@opencode-ai/sdk"
import { PILOT_PROMPT, withPromptAppend } from "./prompts"

export function createPilotAgent(model: string, promptAppend?: string): AgentConfig {
  return {
    model,
    mode: "primary",
    color: "primary",
    description: "Main orchestration agent for direct work and delegation",
    prompt: withPromptAppend(PILOT_PROMPT, promptAppend),
    permission: {
      edit: "allow",
      bash: "allow",
      webfetch: "allow",
      external_directory: "allow",
      task: {
        "*": "deny",
        worker: "allow",
        scouter: "allow",
        architect: "allow",
        researcher: "allow",
      },
    } as AgentConfig["permission"],
  }
}
