import type { AgentConfig } from "@opencode-ai/sdk";
import type { ForgeConfig } from "../config/schema";
import type { AgentDefinition, AgentName, Category } from "./types";
export interface AgentRegistry {
    getAll(): AgentDefinition[];
    getActive(): AgentDefinition[];
    isForgeAgent(name?: string): name is AgentName;
    isDisabled(name: AgentName): boolean;
    getDefaultCategory(name: AgentName): Category;
    canDelegate(from: AgentName, to: AgentName): boolean;
    buildConfig(name: AgentName, model: string): AgentConfig;
}
export declare function createAgentRegistry(config: ForgeConfig): AgentRegistry;
