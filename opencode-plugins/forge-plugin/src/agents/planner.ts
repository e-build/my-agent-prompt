import type { AgentConfig } from "@opencode-ai/sdk"
import { PLANNER_PROMPT, withPromptAppend } from "./prompts"

export function createPlannerAgent(model: string, promptAppend?: string): AgentConfig {
  return {
    model,
    mode: "primary",
    color: "info",
    temperature: 0.1,
    description: "Planning agent that interviews and writes execution plans",
    prompt: withPromptAppend(PLANNER_PROMPT, promptAppend),
    permission: {
      edit: "allow",
      bash: "deny",
      webfetch: "deny",
      external_directory: "deny",
      task: {
        "*": "deny",
        scouter: "allow",
        architect: "allow",
        researcher: "allow",
      },
    } as AgentConfig["permission"],
  }
}
