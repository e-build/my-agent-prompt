import type { AgentName } from "../kernel/types";
interface PendingFallback {
    agent: AgentName;
    attempt: number;
    model: string;
}
export interface FallbackStateStore {
    arm(sessionID: string, agent: AgentName, models: string[]): void;
    peek(sessionID: string, agent?: AgentName): PendingFallback | undefined;
    consume(sessionID: string, agent?: AgentName): PendingFallback | undefined;
    clear(sessionID: string): void;
}
export declare function createFallbackState(): FallbackStateStore;
export {};
