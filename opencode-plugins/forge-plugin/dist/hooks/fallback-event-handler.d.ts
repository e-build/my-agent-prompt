import type { AgentModelResolver } from "../kernel/agent-model-resolver";
import type { AgentRegistry } from "../kernel/agent-registry";
import type { FallbackStateStore } from "./fallback-state";
interface RetryContext {
    directory: string;
    client: {
        session: {
            messages(input: {
                path: {
                    id: string;
                };
                query: {
                    directory: string;
                };
            }): Promise<Array<{
                info: {
                    role?: string;
                };
                parts?: Array<{
                    type?: string;
                    text?: string;
                }>;
            }> | {
                data?: Array<{
                    info: {
                        role?: string;
                    };
                    parts?: Array<{
                        type?: string;
                        text?: string;
                    }>;
                }>;
            }>;
            promptAsync(input: {
                path: {
                    id: string;
                };
                body: {
                    agent?: string;
                    model?: {
                        providerID: string;
                        modelID: string;
                    };
                    parts: Array<{
                        type: "text";
                        text: string;
                    }>;
                };
                query: {
                    directory: string;
                };
            }): Promise<unknown>;
        };
    };
}
export declare function createFallbackEventHandler(registry: AgentRegistry, resolver: AgentModelResolver, fallbackState: FallbackStateStore, sessionAgents: Map<string, string>, context?: RetryContext): ({ event }: {
    event: {
        type: string;
        properties?: unknown;
    };
}) => Promise<void>;
export {};
