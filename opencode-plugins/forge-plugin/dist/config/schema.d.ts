import { z } from "zod";
export declare const ForgeConfigSchema: z.ZodObject<{
    categories: z.ZodOptional<z.ZodObject<{
        quick: z.ZodOptional<z.ZodObject<{
            model: z.ZodString;
        }, z.core.$strip>>;
        standard: z.ZodOptional<z.ZodObject<{
            model: z.ZodString;
        }, z.core.$strip>>;
        deep: z.ZodOptional<z.ZodObject<{
            model: z.ZodString;
        }, z.core.$strip>>;
        visual: z.ZodOptional<z.ZodObject<{
            model: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    agents: z.ZodOptional<z.ZodObject<{
        pilot: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        planner: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        architect: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        worker: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        scouter: z.ZodOptional<z.ZodObject<{
            model: z.ZodOptional<z.ZodString>;
            prompt_append: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    disabled_agents: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        planner: "planner";
        architect: "architect";
        worker: "worker";
        scouter: "scouter";
    }>>>;
}, z.core.$strip>;
export type ForgeConfig = z.infer<typeof ForgeConfigSchema>;
