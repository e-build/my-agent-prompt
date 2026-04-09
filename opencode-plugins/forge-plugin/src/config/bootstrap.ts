import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { DEFAULT_AGENT_MODELS } from "../kernel/agent-model-resolver"

function generateDefaultUserConfig(): string {
  const agents = Object.fromEntries(
    Object.entries(DEFAULT_AGENT_MODELS).map(([name, model]) => [name, { model }]),
  )
  return `${JSON.stringify({ disable_builtin_agents: true, agents }, null, 2)}\n`
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
