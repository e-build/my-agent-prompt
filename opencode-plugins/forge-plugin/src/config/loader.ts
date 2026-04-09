import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { parse } from "jsonc-parser"
import { ForgeConfigSchema, type ForgeConfig } from "./schema"

const AGENT_NAMES = ["pilot", "planner", "architect", "worker", "scouter", "researcher"] as const

function mergeAgentOverrides(
  userAgents?: ForgeConfig["agents"],
  projectAgents?: ForgeConfig["agents"],
): ForgeConfig["agents"] | undefined {
  if (!userAgents && !projectAgents) {
    return undefined
  }

  const merged = Object.fromEntries(
    AGENT_NAMES.map((name) => [
      name,
      mergeSingleAgentOverride(userAgents?.[name], projectAgents?.[name]),
    ]),
  ) as ForgeConfig["agents"]

  return AGENT_NAMES.some((name) => merged?.[name]) ? merged : undefined
}

function mergeSingleAgentOverride(
  userAgent?: NonNullable<ForgeConfig["agents"]>[typeof AGENT_NAMES[number]],
  projectAgent?: NonNullable<ForgeConfig["agents"]>[typeof AGENT_NAMES[number]],
) {
  if (!userAgent && !projectAgent) {
    return undefined
  }

  const model = projectAgent?.model ?? userAgent?.model
  const fallback_models =
    projectAgent?.fallback_models !== undefined
      ? projectAgent.fallback_models
      : projectAgent?.model !== undefined
        ? []
        : (userAgent?.fallback_models ?? [])
  const prompt_append = projectAgent?.prompt_append ?? userAgent?.prompt_append

  return {
    ...(model !== undefined ? { model } : {}),
    ...(fallback_models !== undefined ? { fallback_models } : {}),
    ...(prompt_append !== undefined ? { prompt_append } : {}),
  }
}

async function readConfigFile(filePath: string): Promise<ForgeConfig | undefined> {
  try {
    const text = await readFile(filePath, "utf8")
    return ForgeConfigSchema.parse(parse(text))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

export function mergeConfigs(
  userConfig?: ForgeConfig,
  projectConfig?: ForgeConfig,
): ForgeConfig {
  if (!userConfig && !projectConfig) {
    return {}
  }

  if (!userConfig) {
    return projectConfig ?? {}
  }

  if (!projectConfig) {
    return userConfig
  }

  return {
    agents: mergeAgentOverrides(userConfig.agents, projectConfig.agents),
    disabled_agents: projectConfig.disabled_agents ?? userConfig.disabled_agents,
    disable_builtin_agents:
      projectConfig.disable_builtin_agents ?? userConfig.disable_builtin_agents,
  }
}

export async function loadConfigFromPaths(
  userPath?: string,
  projectPath?: string,
): Promise<ForgeConfig> {
  const [userConfig, projectConfig] = await Promise.all([
    userPath ? readConfigFile(userPath) : undefined,
    projectPath ? readConfigFile(projectPath) : undefined,
  ])

  return mergeConfigs(userConfig, projectConfig)
}

export async function loadConfig(projectDirectory: string): Promise<ForgeConfig> {
  const userPath = join(homedir(), ".config", "opencode", "forge-config.jsonc")
  const projectPath = join(projectDirectory, ".forge", "config.jsonc")
  return loadConfigFromPaths(userPath, projectPath)
}
