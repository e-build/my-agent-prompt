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

const DEFAULT_CONFIG: CliproxyapiConfig = {
  baseURL: "http://localhost:8317/v1",
  apiKey: "dummy",
};

const DEFAULT_CONFIG_PATH = join(homedir(), ".config/opencode/cliproxyapi-sync-config.jsonc");

export default async function cliproxyapiSync(pi: ExtensionAPI) {
  try {
    const config = await loadConfig();
    const models = await fetchModels(config);
    const providers = buildProviderConfigs(config, models);

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

export function buildProviderConfigs(config: CliproxyapiConfig, models: ProxyModel[]): Record<string, ProviderConfig> {
  const providers: Record<string, ProviderConfig> = {};
  const baseUrl = normalizeBaseUrl(config.baseURL);

  for (const model of models) {
    if (!model.id.includes("/")) continue;

    const prefix = model.id.slice(0, model.id.indexOf("/"));
    const providerName = `cp-${sanitizeProviderPart(prefix)}`;
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
      id: model.id,
      name: model.id,
      reasoning: isReasoningModel(model.id),
      input: isImageModel(model.id) ? ["text", "image"] : ["text"],
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

  const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
  if (!Array.isArray(payload.data)) {
    throw new Error("model list response does not contain a data array");
  }

  return payload.data.flatMap((model) => (typeof model.id === "string" && model.id ? [{ id: model.id }] : []));
}

function normalizeBaseUrl(baseURL: string): string {
  return baseURL.replace(/\/+$/, "");
}

function sanitizeProviderPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "proxy";
}

function isReasoningModel(id: string): boolean {
  return /(?:thinking|-(?:minimal|low|medium|high|xhigh))$/i.test(id);
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
