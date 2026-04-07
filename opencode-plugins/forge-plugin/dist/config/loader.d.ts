import { type ForgeConfig } from "./schema";
export declare function mergeConfigs(userConfig?: ForgeConfig, projectConfig?: ForgeConfig): ForgeConfig;
export declare function loadConfigFromPaths(userPath?: string, projectPath?: string): Promise<ForgeConfig>;
export declare function loadConfig(projectDirectory: string): Promise<ForgeConfig>;
