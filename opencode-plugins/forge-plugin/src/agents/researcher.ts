import type { AgentConfig } from "@opencode-ai/sdk"
import { RESEARCHER_PROMPT, withPromptAppend } from "./prompts"

export function createResearcherAgent(model: string, promptAppend?: string): AgentConfig {
  return {
    model,
    mode: "subagent",
    hidden: true,
    description: "Read-only external research agent for docs and web references",
    prompt: withPromptAppend(RESEARCHER_PROMPT, promptAppend),
    permission: {
      edit: "deny",
      bash: "deny",
      webfetch: "allow",
      websearch: "allow",
      codesearch: "allow",
      external_directory: "deny",
      task: "deny",
    } as AgentConfig["permission"],
  }
}
