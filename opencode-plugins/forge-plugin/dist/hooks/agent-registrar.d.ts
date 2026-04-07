import type { Config } from "@opencode-ai/plugin";
import type { AgentRegistry } from "../kernel/agent-registry";
import type { CategoryRouter } from "../kernel/category-router";
export declare function createAgentRegistrar(registry: AgentRegistry, router: CategoryRouter): (config: Config) => Promise<void>;
