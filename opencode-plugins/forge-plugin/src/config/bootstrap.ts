import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { DEFAULT_AGENT_MODELS } from "../kernel/agent-model-resolver"

function generateDefaultUserConfig(): string {
  return `{
  "disable_builtin_agents": true,
  "agents": {
    "pilot": { "model": "${DEFAULT_AGENT_MODELS.pilot}" },
    "planner": { "model": "${DEFAULT_AGENT_MODELS.planner}" },
    "architect": { "model": "${DEFAULT_AGENT_MODELS.architect}" },
    "worker": {
      "model": "${DEFAULT_AGENT_MODELS.worker}",
      "fallback_models": ["openai/gpt-5.4"]
    },
    "scouter": { "model": "${DEFAULT_AGENT_MODELS.scouter}" },
    "researcher": { "model": "${DEFAULT_AGENT_MODELS.researcher}" }
  }
}
`
}

export async function ensureUserConfigBootstrap(userPath: string): Promise<void> {
  try {
    await writeFile(userPath, generateDefaultUserConfig(), {
      encoding: "utf8",
      flag: "wx",
    })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code

    if (code === "ENOENT") {
      await mkdir(dirname(userPath), { recursive: true })
      await ensureUserConfigBootstrap(userPath)
      return
    }

    if (code === "EEXIST") {
      return
    }

    throw error
  }
}
