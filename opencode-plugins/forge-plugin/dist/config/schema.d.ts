import { z } from "zod";
export declare const ForgeConfigSchema: z.ZodObject<{
    agents: z.ZodOptional<z.ZodObject<{
        pilot: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        planner: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        architect: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        worker: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        scouter: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        researcher: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    disabled_agents: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        planner: "planner";
        architect: "architect";
        worker: "worker";
        scouter: "scouter";
        researcher: "researcher";
    }>>>;
    disable_builtin_agents: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type ForgeConfig = z.infer<typeof ForgeConfigSchema>;
