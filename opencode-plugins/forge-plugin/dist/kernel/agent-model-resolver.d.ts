import type { ForgeConfig } from "../config/schema";
import type { AgentModelRoute, AgentName, ModelRef } from "./types";
declare const DEFAULT_AGENT_MODELS: Record<AgentName, string>;
export interface AgentModelResolver {
    resolveAgentModel(agent: AgentName): string;
    resolveAgentRoute(agent: AgentName): AgentModelRoute;
    parse(model: string): ModelRef;
}
export declare function createAgentModelResolver(config: ForgeConfig): AgentModelResolver;
export { DEFAULT_AGENT_MODELS };
