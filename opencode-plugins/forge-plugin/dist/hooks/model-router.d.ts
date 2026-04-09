import type { AgentRegistry } from "../kernel/agent-registry";
import type { AgentModelResolver } from "../kernel/agent-model-resolver";
import type { FallbackStateStore } from "./fallback-state";
export declare function createModelRouter(registry: AgentRegistry, resolver: AgentModelResolver, fallbackState?: FallbackStateStore): (input: {
    sessionID: string;
    agent?: string;
    variant?: string;
}, output: {
    message: {
        model: {
            providerID: string;
            modelID: string;
        };
    };
}) => Promise<void>;
