import { test } from "node:test";
import assert from "node:assert/strict";

import { buildProviderConfigs } from "./cliproxyapi-sync.ts";

type BuiltProviders = ReturnType<typeof buildProviderConfigs>;

const baseConfig = { baseURL: "http://localhost:8317/v1", apiKey: "dummy" };

function findModel(providers: BuiltProviders, providerName: string, modelId: string) {
  const provider = providers[providerName];
  assert.ok(provider, `provider ${providerName} not found`);
  const model = provider.models.find((entry) => entry.id === modelId);
  assert.ok(model, `model ${modelId} not found in ${providerName}`);
  return model;
}

// helper: codex info entries now carry { contextWindow?, reasoningLevels? }
const cw = (n: number) => ({ contextWindow: n });
const levels = (...l: string[]) => ({ reasoningLevels: [...l] });

test("uses codex context_window when slug matches normalized id", () => {
  const models = [{ id: "openai/gpt-5.4", owned_by: "openai" }];
  const codex = new Map([["openai/gpt-5.4", cw(272000)]]);
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.4").contextWindow, 272000);
});

test("uses codex context_window when slug matches raw id", () => {
  // codex response exposes both "gpt-5.4" and "openai/gpt-5.4" as separate slugs
  const models = [{ id: "gpt-5.4", owned_by: "openai" }];
  const codex = new Map([["gpt-5.4", cw(400000)]]);
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.4").contextWindow, 400000);
});

test("falls back to 128000 when slug is missing from codex map", () => {
  const models = [{ id: "openai/gpt-5.4", owned_by: "openai" }];
  const providers = buildProviderConfigs(baseConfig, models, {}, new Map());

  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.4").contextWindow, 128000);
});

test("falls back to 128000 when empty codex map is passed", () => {
  const models = [
    { id: "openai/gpt-5.4", owned_by: "openai" },
    { id: "deepseek/deepseek-v4-pro", owned_by: "deepseek" },
  ];
  const providers = buildProviderConfigs(baseConfig, models, {}, new Map());

  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.4").contextWindow, 128000);
  assert.equal(findModel(providers, "cp-deepseek", "deepseek/deepseek-v4-pro").contextWindow, 128000);
});

test("does not use max_context_window — only context_window field", () => {
  // Guards against accidentally reading max_context_window instead.
  // codex map is built upstream from context_window only; this just pins behavior.
  const models = [{ id: "openai/gpt-5.4", owned_by: "openai" }];
  const codex = new Map([["openai/gpt-5.4", cw(272000)]]);
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  assert.notEqual(findModel(providers, "cp-openai", "openai/gpt-5.4").contextWindow, 1000000);
  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.4").contextWindow, 272000);
});

test("reasoning variant inherits base slug context_window", () => {
  const models = [{ id: "openai/gpt-5.5", owned_by: "openai" }];
  const config = { ...baseConfig, reasoningVariants: { "gpt-5.5": ["high"] } };
  const codex = new Map([["openai/gpt-5.5", cw(272000)]]);
  const providers = buildProviderConfigs(config, models, {}, codex);

  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.5").contextWindow, 272000);
  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.5-high").contextWindow, 272000);
});

test("reasoning variant falls back when base slug is unmapped", () => {
  const models = [{ id: "openai/gpt-5.5", owned_by: "openai" }];
  const config = { ...baseConfig, reasoningVariants: { "gpt-5.5": ["high"] } };
  const providers = buildProviderConfigs(config, models, {}, new Map());

  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.5-high").contextWindow, 128000);
});

test("non-positive codex value is ignored and falls back", () => {
  // Defensive: the upstream fetch already filters via asPositiveInteger,
  // but resolveContextWindow must also guard against bad entries.
  const models = [{ id: "openai/gpt-5.4", owned_by: "openai" }];
  const codex = new Map([["openai/gpt-5.4", cw(0)]]);
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.4").contextWindow, 128000);
});

test("models with different owners resolve independently", () => {
  const models = [
    { id: "openai/gpt-5.4", owned_by: "openai" },
    { id: "deepseek/deepseek-v4-pro", owned_by: "deepseek" },
    { id: "zai/glm-5.2", owned_by: "zai" },
  ];
  const codex = new Map([
    ["openai/gpt-5.4", cw(272000)],
    ["deepseek/deepseek-v4-pro", cw(192000)],
    ["zai/glm-5.2", cw(128000)],
  ]);
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  assert.equal(findModel(providers, "cp-openai", "openai/gpt-5.4").contextWindow, 272000);
  assert.equal(findModel(providers, "cp-deepseek", "deepseek/deepseek-v4-pro").contextWindow, 192000);
  assert.equal(findModel(providers, "cp-zai", "zai/glm-5.2").contextWindow, 128000);
});

// --- reasoning / thinkingLevelMap coverage ---

test("reasoning: false and no thinkingLevelMap when codex exposes no levels", () => {
  const models = [{ id: "openai/gpt-5.4", owned_by: "openai" }];
  const codex = new Map([["openai/gpt-5.4", cw(272000)]]); // contextWindow only, no levels
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  const model = findModel(providers, "cp-openai", "openai/gpt-5.4");
  assert.equal(model.reasoning, false);
  assert.equal("thinkingLevelMap" in model, false);
});

test("model advertising low/medium/high caps xhigh at high", () => {
  const models = [{ id: "deepseek/deepseek-v4-pro", owned_by: "deepseek" }];
  const codex = new Map([["deepseek/deepseek-v4-pro", { ...cw(128000), ...levels("low", "medium", "high") }]]);
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  const model = findModel(providers, "cp-deepseek", "deepseek/deepseek-v4-pro");
  assert.equal(model.reasoning, true);
  assert.deepEqual(model.thinkingLevelMap, {
    off: null,
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: null, // provider has no tier above high
  });
});

test("model advertising low..xhigh maps xhigh to xhigh", () => {
  const models = [{ id: "openai/gpt-5.4", owned_by: "openai" }];
  const codex = new Map([
    ["openai/gpt-5.4", { ...cw(272000), ...levels("low", "medium", "high", "xhigh") }],
  ]);
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  const model = findModel(providers, "cp-openai", "openai/gpt-5.4");
  assert.equal(model.reasoning, true);
  assert.equal(model.thinkingLevelMap?.xhigh, "xhigh");
});

test("model advertising max collapses pi xhigh to provider max (gpt-5.6)", () => {
  const models = [{ id: "openai/gpt-5.6-sol", owned_by: "openai" }];
  const codex = new Map([
    ["openai/gpt-5.6-sol", { ...cw(272000), ...levels("low", "medium", "high", "xhigh", "max") }],
  ]);
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  const model = findModel(providers, "cp-openai", "openai/gpt-5.6-sol");
  assert.equal(model.reasoning, true);
  assert.equal(model.thinkingLevelMap?.xhigh, "max"); // max preferred over xhigh
  assert.equal(model.thinkingLevelMap?.high, "high");
});

test("supportsReasoningEffort is enabled on proxy providers", () => {
  const models = [{ id: "zai/glm-5.2", owned_by: "zai" }];
  const codex = new Map([["zai/glm-5.2", { ...cw(128000), ...levels("low", "medium", "high") }]]);
  const providers = buildProviderConfigs(baseConfig, models, {}, codex);

  assert.equal(providers["cp-zai"]?.compat.supportsReasoningEffort, true);
});
