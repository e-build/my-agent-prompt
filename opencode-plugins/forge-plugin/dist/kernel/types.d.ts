import type { AgentConfig } from "@opencode-ai/sdk";
export type AgentName = "pilot" | "planner" | "architect" | "worker" | "scouter" | "researcher";
export interface ModelRef {
    providerID: string;
    modelID: string;
}
export interface AgentModelRoute {
    model: string;
    fallbackModels: string[];
}
export interface AgentDefinition {
    name: AgentName;
    delegatesTo: AgentName[];
    createConfig(model: string, promptAppend?: string): AgentConfig;
}
export declare function parseModelString(model: string): ModelRef;
