import type { AgentRegistry } from "../kernel/agent-registry";
import type { CategoryRouter } from "../kernel/category-router";
export declare function createModelRouter(registry: AgentRegistry, router: CategoryRouter): (input: {
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
