import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parse } from "jsonc-parser"
import { ForgeConfigSchema, type ForgeConfig } from "../config/schema"
import {
  applyAgentModelBindings,
  formatRecommendations,
  parseModelList,
  recommendAgentModels,
} from "../kernel/model-recommendations"

async function loadProjectConfig(configPath: string): Promise<ForgeConfig> {
  try {
    return ForgeConfigSchema.parse(parse(await readFile(configPath, "utf8")))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      return {}
    }
    throw error
  }
}

async function getModels(models?: string[]): Promise<string[]> {
  if (models) {
    return models
  }

  const output = await new Promise<string>((resolve, reject) => {
    execFile("opencode", ["models", "--pure"], { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }

      resolve(stdout)
    })
  })

  return parseModelList(output)
}

export const recommendModelsTool: ToolDefinition = tool({
  description: "Recommend Forge agent model bindings from available OpenCode models.",
  args: {
    models: tool.schema.array(tool.schema.string()).optional().describe(
      "Optional model list for tests or manual input. Defaults to `opencode models --pure`.",
    ),
  },
  async execute(args, context) {
    const configPath = join(context.directory, ".forge", "config.jsonc")
    const config = await loadProjectConfig(configPath)
    const models = await getModels(args.models)
    const recommendations = recommendAgentModels(models, config)

    return formatRecommendations(recommendations)
  },
})

export const bindModelsTool: ToolDefinition = tool({
  description: "Write approved Forge agent model bindings to .forge/config.jsonc.",
  args: {
    approved: tool.schema.boolean().describe(
      "Must be true only after the user explicitly approves binding the recommended models.",
    ),
    models: tool.schema.array(tool.schema.string()).optional().describe(
      "Optional model list for tests or manual input. Defaults to `opencode models --pure`.",
    ),
  },
  async execute(args, context) {
    if (!args.approved) {
      return "Model binding requires explicit user approval before writing .forge/config.jsonc."
    }

    const forgeDir = join(context.directory, ".forge")
    const configPath = join(forgeDir, "config.jsonc")
    const config = await loadProjectConfig(configPath)
    const models = await getModels(args.models)
    const recommendations = recommendAgentModels(models, config)
    const nextConfig = applyAgentModelBindings(config, recommendations)

    await mkdir(forgeDir, { recursive: true })
    await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8")

    return [
      "Updated .forge/config.jsonc with approved Forge model bindings.",
      "",
      formatRecommendations(recommendations),
    ].join("\n")
  },
})
