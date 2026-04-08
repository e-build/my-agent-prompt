import type { Config } from "@opencode-ai/plugin";
import type { AgentRegistry } from "../kernel/agent-registry";
import type { AgentModelResolver } from "../kernel/agent-model-resolver";
export declare function createAgentRegistrar(registry: AgentRegistry, resolver: AgentModelResolver): (config: Config) => Promise<void>;
