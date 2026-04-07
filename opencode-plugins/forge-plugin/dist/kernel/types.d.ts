import type { AgentConfig } from "@opencode-ai/sdk";
export type AgentName = "pilot" | "planner" | "architect" | "worker" | "scouter";
export type Category = "quick" | "standard" | "deep" | "visual";
export interface ModelRef {
    providerID: string;
    modelID: string;
}
export interface AgentDefinition {
    name: AgentName;
    defaultCategory: Category;
    delegatesTo: AgentName[];
    createConfig(model: string, promptAppend?: string): AgentConfig;
}
export declare function parseModelString(model: string): ModelRef;
