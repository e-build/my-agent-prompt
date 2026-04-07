import type { ForgeConfig } from "../config/schema";
import type { AgentName, Category, ModelRef } from "./types";
declare const DEFAULT_MODELS: Record<Category, string>;
export interface CategoryRouter {
    resolveCategory(category: Category): string;
    resolveAgent(agent: AgentName, category: Category): string;
    parse(model: string): ModelRef;
}
export declare function createCategoryRouter(config: ForgeConfig): CategoryRouter;
export { DEFAULT_MODELS };
