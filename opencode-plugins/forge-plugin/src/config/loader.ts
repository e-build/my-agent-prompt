import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { parse } from "jsonc-parser"
import { ForgeConfigSchema, type ForgeConfig } from "./schema"

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
    categories: {
      ...userConfig.categories,
      ...projectConfig.categories,
    },
    agents: {
      ...userConfig.agents,
      ...projectConfig.agents,
    },
    disabled_agents: projectConfig.disabled_agents ?? userConfig.disabled_agents,
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
  const userPath = join(homedir(), ".config", "opencode", "forge.jsonc")
  const projectPath = join(projectDirectory, ".forge", "config.jsonc")
  return loadConfigFromPaths(userPath, projectPath)
}
