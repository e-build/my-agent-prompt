import type { ForgeConfig } from "../config/schema";
import type { AgentName } from "./types";
export interface AgentModelRecommendation {
    agent: AgentName;
    currentModel: string;
    recommendedModel: string;
    reason: string;
}
export declare function parseModelList(output: string): string[];
export declare function recommendAgentModels(models: string[], config: ForgeConfig): AgentModelRecommendation[];
export declare function applyAgentModelBindings(config: ForgeConfig, recommendations: AgentModelRecommendation[]): ForgeConfig;
export declare function formatRecommendations(recommendations: AgentModelRecommendation[]): string;
