export declare function createPlannerWriteGuard(projectDirectory: string, sessionAgents: Map<string, string>): (input: {
    tool: string;
    sessionID: string;
    callID: string;
}, output: {
    args: {
        filePath?: string;
    };
}) => Promise<void>;
