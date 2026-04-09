import { z } from "zod"

const AgentOverrideSchema = z.object({
  model: z.string().optional(),
  prompt_append: z.string().optional(),
})

export const ForgeConfigSchema = z.object({
  agents: z.object({
    pilot: AgentOverrideSchema.optional(),
    planner: AgentOverrideSchema.optional(),
    architect: AgentOverrideSchema.optional(),
    worker: AgentOverrideSchema.optional(),
    scouter: AgentOverrideSchema.optional(),
    researcher: AgentOverrideSchema.optional(),
  }).optional(),
  disabled_agents: z.array(
    z.enum(["planner", "architect", "worker", "scouter", "researcher"]),
  ).optional(),
  disable_builtin_agents: z.boolean().optional(),
}).strict()

export type ForgeConfig = z.infer<typeof ForgeConfigSchema>
