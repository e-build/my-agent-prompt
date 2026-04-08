import type { AgentRegistry } from "../kernel/agent-registry";
import type { AgentModelResolver } from "../kernel/agent-model-resolver";
export declare function createModelRouter(registry: AgentRegistry, resolver: AgentModelResolver): (input: {
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
