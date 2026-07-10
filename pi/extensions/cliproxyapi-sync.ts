import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type ExtensionAPI = {
  registerProvider(name: string, config: ProviderConfig): void;
};

type ReasoningLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

type CliproxyapiConfig = {
  baseURL: string;
  apiKey: string;
  managementKey?: string;
  reasoningVariants?: Record<string, ReasoningLevel[]>;
  lmStudioBaseURL?: string;
};

type ProxyModel = {
  id: string;
  owned_by?: string;
};

type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  api: "openai-completions";
  compat: {
    supportsDeveloperRole: false;
    supportsReasoningEffort: true;
    maxTokensField: "max_tokens";
  };
  models: ProviderModelConfig[];
};

type ProviderModelConfig = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  thinkingLevelMap?: ThinkingLevelMap;
};

type ManagedModelModality = "text" | "audio" | "image" | "video" | "pdf";

type ModelMetadata = {
  attachment?: boolean;
  modalities?: {
    input: ManagedModelModality[];
    output: ManagedModelModality[];
  };
};

type ModelMetadataByOwner = Record<string, Record<string, ModelMetadata>>;

type ModelsDevCatalog = Record<
  string,
  {
    models?: Record<
      string,
      {
        attachment?: unknown;
        modalities?: {
          input?: unknown;
          output?: unknown;
        };
      }
    >;
  }
>;

type CodexModelEntry = {
  slug?: unknown;
  context_window?: unknown;
  max_context_window?: unknown;
  supported_reasoning_levels?: unknown;
};

type CodexModelsResponse = { models?: CodexModelEntry[] };

type CodexModelInfo = {
  contextWindow?: number;
  reasoningLevels?: string[];
};

// pi thinking levels (off/minimal/low/medium/high/xhigh) mapped to provider effort values.
// ponytail: provider tiers low<medium<high<xhigh<max collapse onto pi's 6 levels; pi has no
// slot above xhigh, so provider "max" (gpt-5.6 family) surfaces as pi `xhigh`.
type ThinkingLevelMap = Partial<
  Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh", string | null>
>;

const DEFAULT_CONFIG: CliproxyapiConfig = {
  baseURL: "http://localhost:8317/v1",
  apiKey: "dummy",
  lmStudioBaseURL: "http://127.0.0.1:1234",
};

const DEFAULT_CONFIG_PATH = join(homedir(), ".config/opencode/cliproxyapi-sync-config.jsonc");
const SUPPORTED_MODALITIES = new Set<ManagedModelModality>(["text", "audio", "image", "video", "pdf"]);
const DEFAULT_CONTEXT_WINDOW = 128000;
const REASONING_SUFFIX_PATTERN = /-(?:minimal|low|medium|high|xhigh)$/i;

export default async function cliproxyapiSync(pi: ExtensionAPI) {
  try {
    const config = await loadConfig();
    const models = await fetchModels(config);
    const codexInfoBySlug = await fetchCodexContextWindows(config);
    const lmStudioContextByModel = await fetchLmStudioContextWindows(config);
    const metadataByOwner = await fetchModelsDevMetadataByOwner(models);
    const providers = buildProviderConfigs(config, models, metadataByOwner, codexInfoBySlug, lmStudioContextByModel);

    for (const [providerName, providerConfig] of Object.entries(providers)) {
      pi.registerProvider(providerName, providerConfig);
    }

    const modelCount = Object.values(providers).reduce((sum, provider) => sum + provider.models.length, 0);
    const reasoningCount = Object.values(providers).reduce(
      (sum, provider) => sum + provider.models.filter((model) => model.reasoning).length,
      0,
    );
    console.log(
      `[cliproxyapi-sync] registered ${modelCount} models (${reasoningCount} reasoning) across ${Object.keys(providers).length} providers`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cliproxyapi-sync] disabled: ${message}`);
  }
}

export function buildProviderConfigs(
  config: CliproxyapiConfig,
  models: ProxyModel[],
  metadataByOwner: ModelMetadataByOwner = {},
  codexInfoBySlug: Map<string, CodexModelInfo> = new Map(),
  lmStudioContextByModel: Map<string, number> = new Map(),
): Record<string, ProviderConfig> {
  const providers: Record<string, ProviderConfig> = {};
  const seenModelIdsByProvider: Record<string, Set<string>> = {};
  const baseUrl = normalizeBaseUrl(config.baseURL);

  for (const model of models) {
    const owner = resolveModelOwner(model);
    if (!owner) continue;

    const normalizedId = normalizeManagedModelId(owner, model.id);
    const rawId = stripOwnedModelPrefix(owner, normalizedId);
    const metadata =
      metadataByOwner[owner]?.[normalizedId] ??
      metadataByOwner[owner]?.[rawId] ??
      metadataByOwner[owner]?.[model.id];

    const providerName = `cp-${sanitizeProviderPart(owner)}`;
    providers[providerName] ??= {
      baseUrl,
      apiKey: config.apiKey,
      api: "openai-completions",
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        maxTokensField: "max_tokens",
      },
      models: [],
    };
    seenModelIdsByProvider[providerName] ??= new Set<string>();

    const modelIds = [
      normalizedId,
      ...buildConfiguredReasoningVariantIds(config, owner, normalizedId),
    ];

    for (const modelId of modelIds) {
      if (seenModelIdsByProvider[providerName].has(modelId)) continue;
      seenModelIdsByProvider[providerName].add(modelId);

      const visibleRawId = stripOwnedModelPrefix(owner, modelId);
      const resolvedContextWindow = resolveContextWindow({
        modelId,
        normalizedId,
        rawId,
        codexInfoBySlug,
        lmStudioContextByModel,
      });
      const reasoningLevels = resolveReasoningLevels({
        modelId,
        normalizedId,
        rawId,
        codexInfoBySlug,
      });
      const thinkingLevelMap = buildThinkingLevelMap(reasoningLevels);
      providers[providerName].models.push({
        id: modelId,
        name: modelId,
        reasoning: reasoningLevels.length > 0 || isReasoningModel(visibleRawId),
        input: supportsImageInput(owner, normalizedId, metadata) ? ["text", "image"] : ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: resolvedContextWindow,
        maxTokens: 16384,
        ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
      });
    }
  }

  for (const provider of Object.values(providers)) {
    provider.models.sort((left, right) => left.id.localeCompare(right.id));
  }

  return providers;
}

async function loadConfig(): Promise<CliproxyapiConfig> {
  const path = process.env.CLIPROXYAPI_SYNC_CONFIG ?? DEFAULT_CONFIG_PATH;

  try {
    const content = await readFile(path, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(stripJsonComments(content)) };
  } catch (error) {
    if (isMissingFileError(error)) return DEFAULT_CONFIG;
    throw error;
  }
}

async function fetchModels(config: CliproxyapiConfig): Promise<ProxyModel[]> {
  const response = await fetch(`${normalizeBaseUrl(config.baseURL)}/models`, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`model list request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { data?: Array<{ id?: unknown; owned_by?: unknown }> };
  if (!Array.isArray(payload.data)) {
    throw new Error("model list response does not contain a data array");
  }

  return payload.data.flatMap((model) => {
    if (typeof model.id !== "string" || !model.id) return [];
    return [
      {
        id: model.id,
        ...(typeof model.owned_by === "string" && model.owned_by ? { owned_by: model.owned_by } : {}),
      },
    ];
  });
}

async function fetchCodexContextWindows(config: CliproxyapiConfig): Promise<Map<string, CodexModelInfo>> {
  try {
    const url = `${normalizeBaseUrl(config.baseURL)}/models?client_version=1`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`codex models request failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as CodexModelsResponse;
    if (!Array.isArray(payload.models)) {
      throw new Error("codex models response does not contain a models array");
    }

    const map = new Map<string, CodexModelInfo>();
    for (const entry of payload.models) {
      const slug = typeof entry.slug === "string" ? entry.slug : undefined;
      if (!slug) continue;
      const contextWindow = asPositiveInteger(entry.context_window);
      const reasoningLevels = extractReasoningLevels(entry.supported_reasoning_levels);
      const info: CodexModelInfo = {};
      if (contextWindow) info.contextWindow = contextWindow;
      if (reasoningLevels.length > 0) info.reasoningLevels = reasoningLevels;
      if (Object.keys(info).length > 0) map.set(slug, info);
    }
    return map;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cliproxyapi-sync] codex context_window sync skipped: ${message}`);
    return new Map();
  }
}

async function fetchLmStudioContextWindows(config: CliproxyapiConfig): Promise<Map<string, number>> {
  const baseURL = config.lmStudioBaseURL ?? DEFAULT_CONFIG.lmStudioBaseURL ?? "http://127.0.0.1:1234";
  try {
    const url = `${normalizeBaseUrl(baseURL)}/api/v0/models`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`LM Studio models request failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { data?: Array<{ id?: unknown; loaded_context_length?: unknown }> };
    if (!Array.isArray(payload.data)) {
      throw new Error("LM Studio models response does not contain a data array");
    }

    const map = new Map<string, number>();
    for (const entry of payload.data) {
      const id = typeof entry.id === "string" ? entry.id : undefined;
      const contextWindow = asPositiveInteger(entry.loaded_context_length);
      if (id && contextWindow) map.set(id, contextWindow);
    }
    return map;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cliproxyapi-sync] LM Studio context sync skipped: ${message}`);
    return new Map();
  }
}

async function fetchModelsDevMetadataByOwner(models: ProxyModel[]): Promise<ModelMetadataByOwner> {
  try {
    const response = await fetch("https://models.dev/api.json");
    if (!response.ok) {
      throw new Error(`capability fetch failed: HTTP ${response.status}`);
    }

    const catalog = (await response.json()) as ModelsDevCatalog;
    return buildModelsDevMetadataByOwner(catalog, models);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cliproxyapi-sync] models.dev capability sync skipped: ${message}`);
    return {};
  }
}

function buildModelsDevMetadataByOwner(catalog: ModelsDevCatalog, models: ProxyModel[]): ModelMetadataByOwner {
  const byOwner: ModelMetadataByOwner = {};

  for (const model of models) {
    const owner = resolveModelOwner(model);
    if (!owner) continue;

    const provider = catalog[owner] ?? catalog[normalizeOwner(owner)];
    const rawId = stripOwnedModelPrefix(owner, model.id);
    const modelEntry = provider?.models?.[rawId] ?? provider?.models?.[model.id];
    if (!modelEntry || typeof modelEntry !== "object") continue;

    const attachment = modelEntry.attachment === true ? true : undefined;
    const modalities = normalizeModalities(modelEntry.modalities);
    if (!attachment && !modalities) continue;

    const metadata: ModelMetadata = {
      ...(attachment ? { attachment } : {}),
      ...(modalities ? { modalities } : {}),
    };

    byOwner[owner] ??= {};
    byOwner[owner][rawId] = metadata;
    byOwner[owner][model.id] = metadata;
    byOwner[owner][buildOwnedModelId(owner, rawId)] = metadata;
  }

  return byOwner;
}

function normalizeModalities(values: unknown): ModelMetadata["modalities"] | undefined {
  if (!values || typeof values !== "object") return undefined;

  const input = normalizeModalityList((values as { input?: unknown }).input);
  const output = normalizeModalityList((values as { output?: unknown }).output);
  if (!input || !output) return undefined;

  return { input, output };
}

function normalizeModalityList(values: unknown): ManagedModelModality[] | undefined {
  if (!Array.isArray(values)) return undefined;

  const normalized = values.filter(
    (value): value is ManagedModelModality => typeof value === "string" && SUPPORTED_MODALITIES.has(value as ManagedModelModality),
  );

  return normalized.length > 0 ? normalized : undefined;
}

function resolveModelOwner(model: ProxyModel): string | undefined {
  if (typeof model.owned_by === "string" && model.owned_by) return model.owned_by;
  if (!model.id.includes("/")) return undefined;
  return model.id.slice(0, model.id.indexOf("/"));
}

function normalizeBaseUrl(baseURL: string): string {
  return baseURL.replace(/\/+$/, "");
}

function normalizeOwner(owner: string): string {
  return owner
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function sanitizeProviderPart(value: string): string {
  return normalizeOwner(value).replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "proxy";
}

function buildOwnedModelId(owner: string, id: string): string {
  return `${owner}/${id}`;
}

function stripOwnedModelPrefix(owner: string, id: string): string {
  const prefix = `${owner}/`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function normalizeManagedModelId(owner: string, id: string): string {
  return buildOwnedModelId(owner, stripOwnedModelPrefix(owner, id));
}

function buildConfiguredReasoningVariantIds(
  config: CliproxyapiConfig,
  owner: string,
  normalizedId: string,
): string[] {
  const configuredLevels = resolveConfiguredReasoningLevels(config, owner, normalizedId);
  return configuredLevels.map((level) => `${normalizedId}-${level}`);
}

function resolveConfiguredReasoningLevels(
  config: CliproxyapiConfig,
  owner: string,
  normalizedId: string,
): ReasoningLevel[] {
  const rawId = stripOwnedModelPrefix(owner, normalizedId);
  const configured =
    config.reasoningVariants?.[normalizedId] ??
    config.reasoningVariants?.[rawId];

  if (!Array.isArray(configured)) return [];

  const uniqueLevels = new Set<ReasoningLevel>();
  for (const level of configured) {
    if (isReasoningLevel(level)) uniqueLevels.add(level);
  }

  return [...uniqueLevels];
}

function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function isReasoningModel(id: string): boolean {
  return /(?:thinking|-(?:minimal|low|medium|high|xhigh))$/i.test(id);
}

function stripReasoningSuffix(id: string): string {
  return id.replace(REASONING_SUFFIX_PATTERN, "");
}

function resolveContextWindow(args: {
  modelId: string;
  normalizedId: string;
  rawId: string;
  codexInfoBySlug: Map<string, CodexModelInfo>;
  lmStudioContextByModel: Map<string, number>;
}): number {
  const strippedModelId = stripReasoningSuffix(args.modelId);
  const codexWindow = (key: string) => args.codexInfoBySlug.get(key)?.contextWindow;
  return (
    asPositiveInteger(args.lmStudioContextByModel.get(args.rawId)) ??
    asPositiveInteger(args.lmStudioContextByModel.get(strippedModelId)) ??
    asPositiveInteger(codexWindow(strippedModelId)) ??
    asPositiveInteger(codexWindow(args.normalizedId)) ??
    asPositiveInteger(codexWindow(args.rawId)) ??
    DEFAULT_CONTEXT_WINDOW
  );
}

function resolveReasoningLevels(args: {
  modelId: string;
  normalizedId: string;
  rawId: string;
  codexInfoBySlug: Map<string, CodexModelInfo>;
}): string[] {
  const strippedModelId = stripReasoningSuffix(args.modelId);
  return (
    args.codexInfoBySlug.get(strippedModelId)?.reasoningLevels ??
    args.codexInfoBySlug.get(args.normalizedId)?.reasoningLevels ??
    args.codexInfoBySlug.get(args.rawId)?.reasoningLevels ??
    []
  );
}

// Provider advertises tiers low<medium<high<xhigh<max. pi exposes 6 levels; map each pi level
// to its provider twin, and collapse the provider's top tier (max, else xhigh) onto pi `xhigh`.
function buildThinkingLevelMap(levels: string[]): ThinkingLevelMap | undefined {
  if (levels.length === 0) return undefined;
  const supported = new Set(levels);
  return {
    off: null,
    minimal: null,
    low: supported.has("low") ? "low" : null,
    medium: supported.has("medium") ? "medium" : null,
    high: supported.has("high") ? "high" : null,
    xhigh: supported.has("max") ? "max" : supported.has("xhigh") ? "xhigh" : null,
  };
}

function extractReasoningLevels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const levels: string[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && "effort" in item) {
      const effort = (item as { effort?: unknown }).effort;
      if (typeof effort === "string" && effort) levels.push(effort);
    } else if (typeof item === "string" && item) {
      levels.push(item);
    }
  }
  return levels;
}

function asPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function supportsImageInput(owner: string, id: string, metadata?: ModelMetadata): boolean {
  if (metadata?.modalities?.input.includes("image")) return true;
  if (metadata?.modalities) return false;
  return isImageModel(stripOwnedModelPrefix(owner, id));
}

function isImageModel(id: string): boolean {
  return /(?:image|vision)/i.test(id);
}

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];

    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === quote) {
        inString = false;
      }
      continue;
    }

    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      output += current;
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < input.length && input[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }

    output += current;
  }

  return output;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
