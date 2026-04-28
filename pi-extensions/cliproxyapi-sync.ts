import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type ExtensionAPI = {
  registerProvider(name: string, config: ProviderConfig): void;
};

type CliproxyapiConfig = {
  baseURL: string;
  apiKey: string;
  managementKey?: string;
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

const DEFAULT_CONFIG: CliproxyapiConfig = {
  baseURL: "http://localhost:8317/v1",
  apiKey: "dummy",
};

const DEFAULT_CONFIG_PATH = join(homedir(), ".config/opencode/cliproxyapi-sync-config.jsonc");
const SUPPORTED_MODALITIES = new Set<ManagedModelModality>(["text", "audio", "image", "video", "pdf"]);

export default async function cliproxyapiSync(pi: ExtensionAPI) {
  try {
    const config = await loadConfig();
    const models = await fetchModels(config);
    const metadataByOwner = await fetchModelsDevMetadataByOwner(models);
    const providers = buildProviderConfigs(config, models, metadataByOwner);

    for (const [providerName, providerConfig] of Object.entries(providers)) {
      pi.registerProvider(providerName, providerConfig);
    }

    const modelCount = Object.values(providers).reduce((sum, provider) => sum + provider.models.length, 0);
    console.log(`[cliproxyapi-sync] registered ${modelCount} prefixed models across ${Object.keys(providers).length} providers`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cliproxyapi-sync] disabled: ${message}`);
  }
}

export function buildProviderConfigs(
  config: CliproxyapiConfig,
  models: ProxyModel[],
  metadataByOwner: ModelMetadataByOwner = {},
): Record<string, ProviderConfig> {
  const providers: Record<string, ProviderConfig> = {};
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
        maxTokensField: "max_tokens",
      },
      models: [],
    };

    providers[providerName].models.push({
      id: normalizedId,
      name: normalizedId,
      reasoning: isReasoningModel(rawId),
      input: supportsImageInput(owner, normalizedId, metadata) ? ["text", "image"] : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    });
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

function isReasoningModel(id: string): boolean {
  return /(?:thinking|-(?:minimal|low|medium|high|xhigh))$/i.test(id);
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
