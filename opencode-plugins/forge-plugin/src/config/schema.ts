import { z } from "zod"

const CategorySchema = z.object({
  model: z.string(),
})

const AgentOverrideSchema = z.object({
  model: z.string().optional(),
  prompt_append: z.string().optional(),
})

export const ForgeConfigSchema = z.object({
  categories: z.object({
    quick: CategorySchema.optional(),
    standard: CategorySchema.optional(),
    deep: CategorySchema.optional(),
    visual: CategorySchema.optional(),
  }).optional(),
  agents: z.object({
    pilot: AgentOverrideSchema.optional(),
    planner: AgentOverrideSchema.optional(),
    architect: AgentOverrideSchema.optional(),
    worker: AgentOverrideSchema.optional(),
    scouter: AgentOverrideSchema.optional(),
  }).optional(),
  disabled_agents: z.array(
    z.enum(["planner", "architect", "worker", "scouter"]),
  ).optional(),
})

export type ForgeConfig = z.infer<typeof ForgeConfigSchema>
