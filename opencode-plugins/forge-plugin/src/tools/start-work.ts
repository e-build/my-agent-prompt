import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"

interface ForgeState {
  active_plan?: string
  started_at?: string
  session_ids?: string[]
}

async function readState(statePath: string): Promise<ForgeState> {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as ForgeState
  } catch {
    return {}
  }
}

async function listPlans(plansDir: string): Promise<string[]> {
  const names = await readdir(plansDir)
  const planNames = names.filter((name) => name.endsWith(".md"))

  const withTimes = await Promise.all(
    planNames.map(async (name) => ({
      name,
      mtimeMs: (await stat(join(plansDir, name))).mtimeMs,
    })),
  )

  return withTimes.sort((left, right) => right.mtimeMs - left.mtimeMs).map((entry) => entry.name)
}

function normalizePlanName(plan?: string): string | undefined {
  if (!plan) {
    return undefined
  }

  return plan.endsWith(".md") ? plan : `${plan}.md`
}

export const startWorkTool: ToolDefinition = tool({
  description: "Load the active Forge plan or a named plan from .forge/plans/.",
  args: {
    plan: tool.schema.string().optional().describe("Optional plan filename without .md"),
  },
  async execute(args, context) {
    const forgeDir = join(context.directory, ".forge")
    const plansDir = join(forgeDir, "plans")
    const statePath = join(forgeDir, "state.json")
    const explicitPlan = normalizePlanName(args.plan)

    let planFile = explicitPlan
    const state = await readState(statePath)

    if (!planFile && state.active_plan) {
      planFile = state.active_plan.split("/").pop()
    }

    if (!planFile) {
      try {
        const plans = await listPlans(plansDir)
        planFile = plans[0]
      } catch {
        return "No .forge/plans directory found. Use Planner to create a plan first."
      }
    }

    if (!planFile) {
      return "No Forge plan files found. Use Planner to create a plan first."
    }

    const planPath = join(plansDir, planFile)

    let content: string
    try {
      content = await readFile(planPath, "utf8")
    } catch {
      return `Plan not found: ${planFile}`
    }

    const nextState: ForgeState = {
      active_plan: relative(context.directory, planPath),
      started_at: state.started_at ?? new Date().toISOString(),
      session_ids: Array.from(new Set([...(state.session_ids ?? []), context.sessionID])),
    }

    await mkdir(forgeDir, { recursive: true })
    await writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8")

    return [
      `# Active Forge Plan`,
      ``,
      `Path: ${nextState.active_plan}`,
      ``,
      content,
      ``,
      `Execute each unchecked task in order. Delegate implementation to Worker when the task is multi-step, use Scouter for exploration, and verify results before marking work complete.`,
    ].join("\n")
  },
})
