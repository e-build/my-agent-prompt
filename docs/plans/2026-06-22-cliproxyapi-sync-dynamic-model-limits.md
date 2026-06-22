# cliproxyapi-sync Dynamic Model Limits Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make `pi/extensions/cliproxyapi-sync.ts` register each proxied model with its real `contextWindow` (sourced from CLIProxyAPI's existing Codex-format `/v1/models?client_version=1` response), instead of the current fixed `128000`.

**Architecture:** Keep the extension startup flow (`loadConfig` → `fetchModels` → metadata fetch → `buildProviderConfigs`). Insert one extra fetch of `/v1/models?client_version=1` to build a `slug → context_window` map, then join it into each registered model by `id`. No proxy/server changes, no config schema changes, no new dependencies. `maxTokens` stays at the existing default for now.

**Tech Stack:** Pi extension API, TypeScript, CLIProxyAPI OpenAI-compatible + Codex-format endpoints.

---

## Verified facts (2026-06-22, live probe)

Confirmed against the running CLIProxyAPI on `http://localhost:8317` and the upstream Go source:

1. **Plain `/v1/models` is intentionally thin.** The handler `OpenAIModels` in `sdk/api/handlers/openai/openai_handlers.go` filters to only the 4 OpenAI-standard fields:
   ```go
   // Filter to only include the 4 required fields: id, object, created, owned_by
   ```
   This is why every registered model looks like `128000` from the client side.

2. **The `?client_version=` query switches to a richer Codex-format response.** Same handler:
   ```go
   if _, ok := c.Request.URL.Query()["client_version"]; ok {
       c.JSON(http.StatusOK, h.codexClientModelsResponse())
       return
   }
   ```
   `codexClientModelsResponse()` returns `{ "models": [ { slug, context_window, max_context_window, ... } ] }`.

3. **The codex response already contains per-model `context_window` and `max_context_window`, keyed by `slug`, and `slug` exactly matches the plain `id`.** Live sample (18 models):
   ```
   openai/gpt-5.4       context_window=272000   max_context_window=1000000
   openai/gpt-5.4-mini  context_window=400000   max_context_window=400000
   openai/gpt-5.5       context_window=272000   max_context_window=272000
   gpt-5.3-codex-spark  context_window=128000   max_context_window=128000
   deepseek/deepseek-v4-pro  context_window=272000  max_context_window=272000
   zai/glm-5.2          context_window=272000   max_context_window=272000
   ```
   Coverage spans all owners (openai, deepseek, zai) and all 18 plain models, joined 1:1 by `slug == id`.

4. **Field chosen: `context_window` (NOT `max_context_window`)** per user decision.
   - `context_window` = the Codex client's working context tier (e.g. 272000). Conservative.
   - `max_context_window` = the model's theoretical maximum (e.g. 1000000).
   - We use `context_window`.

5. **No `maxTokens` source in the codex response.** `truncation_policy.limit` is a truncation rule (uniformly 10000), not a max-output limit. So `maxTokens` is out of scope for this plan and stays at its existing default.

---

## Problem summary

Current root cause in `pi/extensions/cliproxyapi-sync.ts`:
- `buildProviderConfigs()` always writes `contextWindow: 128000` and `maxTokens: 16384` (lines ~153-154).
- `fetchModels()` only keeps `{ id, owned_by }` from the plain `/v1/models` payload.

The data already exists server-side and is already exposed via the `client_version` branch. The fix is client-side only.

---

### Task 1: Add failing tests for context_window join

**TDD scenario:** Modifying tested code — run existing tests first, then add failing tests.

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts`
- Modify (only after tests fail): `pi/extensions/cliproxyapi-sync.ts`

**Step 1: Run existing related tests**

Run:
```bash
pnpm --filter cliproxyapi-sync test
```
Expected: existing tests pass.

**Step 2: Write failing tests that stub both endpoints**

In the stub, return:
- plain `/v1/models` → `data: [{ id: "openai/gpt-5.4", owned_by: "openai" }]`
- `/v1/models?client_version=1` → `{ models: [{ slug: "openai/gpt-5.4", context_window: 272000, max_context_window: 1000000 }] }`

Assert the built provider config's model has `contextWindow === 272000` (the `context_window` value, NOT 1000000, NOT 128000).

**Step 3: Add fallback test**

- model present in plain list but missing from codex `slug` map → `contextWindow` falls back to `128000`
- model present in codex response with `context_window: 0` or missing → falls back to `128000`

**Step 4: Add reasoning-variant inheritance test**

For a configured reasoning variant (e.g. `openai/gpt-5.5-high`), assert its `contextWindow` equals the base slug's value, not the default.

**Step 5: Run tests to verify failure**

Run:
```bash
pnpm --filter cliproxyapi-sync test
```
Expected: new assertions fail because the extension still hardcodes 128000.

**Step 6: Commit failing-test checkpoint**

```bash
git add opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.test.ts
git commit -m "test: cover cliproxyapi-sync context_window from codex response"
```

---

### Task 2: Fetch the codex-format response and build a slug→context map

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Modify: `pi/extensions/cliproxyapi-sync.ts`

**Step 1: Add a type for the codex response**

```ts
type CodexModelEntry = {
  slug?: string;
  context_window?: unknown;
  max_context_window?: unknown;
};
type CodexModelsResponse = { models?: CodexModelEntry[] };
```

**Step 2: Add `fetchCodexContextWindows(config)`**

```ts
async function fetchCodexContextWindows(config: CliproxyapiConfig): Promise<Map<string, number>> {
  try {
    const url = `${normalizeBaseUrl(config.baseURL)}/models?client_version=1`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${config.apiKey}` } });
    if (!response.ok) throw new Error(`codex models request failed: HTTP ${response.status}`);
    const payload = (await response.json()) as CodexModelsResponse;
    const map = new Map<string, number>();
    for (const entry of payload.models ?? []) {
      const slug = typeof entry.slug === "string" ? entry.slug : undefined;
      const ctx = asPositiveInteger(entry.context_window);
      if (slug && ctx) map.set(slug, ctx);
    }
    return map;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cliproxyapi-sync] codex context_window sync skipped: ${message}`);
    return new Map();
  }
}
```

**Step 3: Add `asPositiveInteger(value: unknown): number | undefined`**

Accept only finite positive integers; ignore `null`, strings, `0`, negatives, `NaN`.

**Step 4: Wire it into the startup flow**

In `cliproxyapiSync(pi)`:
```ts
const config = await loadConfig();
const models = await fetchModels(config);
const codexContextBySlug = await fetchCodexContextWindows(config);   // NEW
const metadataByOwner = await fetchModelsDevMetadataByOwner(models);
const providers = buildProviderConfigs(config, models, metadataByOwner, codexContextBySlug); // pass map
```

**Step 5: Run tests**

Run:
```bash
pnpm --filter cliproxyapi-sync test
```
Expected: Task 1 tests still fail (the builder hasn't consumed the map yet), fetch-level tests pass if added.

---

### Task 3: Use the map in `buildProviderConfigs`

**TDD scenario:** New feature — full TDD cycle.

**Files:**
- Modify: `pi/extensions/cliproxyapi-sync.ts`

**Step 1: Thread the map through the signature**

```ts
export function buildProviderConfigs(
  config: CliproxyapiConfig,
  models: ProxyModel[],
  metadataByOwner: ModelMetadataByOwner = {},
  codexContextBySlug: Map<string, number> = new Map(),   // NEW
): Record<string, ProviderConfig> { ... }
```

**Step 2: Resolve per-model context window**

Inside the model loop, before pushing:
```ts
const resolvedContextWindow = resolveContextWindow({
  normalizedId,
  rawId,
  codexContextBySlug,
});
```

**Step 3: Implement `resolveContextWindow` with reasoning-suffix stripping**

```ts
function resolveContextWindow(args: {
  normalizedId: string;
  rawId: string;
  codexContextBySlug: Map<string, number>;
}): number {
  const base = stripReasoningSuffix(args.normalizedId);
  return (
    args.codexContextBySlug.get(base) ??
    args.codexContextBySlug.get(args.normalizedId) ??
    args.codexContextBySlug.get(args.rawId) ??
    DEFAULT_CONTEXT_WINDOW
  );
}

const DEFAULT_CONTEXT_WINDOW = 128000;
```

`stripReasoningSuffix` removes trailing `-minimal/-low/-medium/-high/-xhigh` so variants inherit the base model's value.

**Step 4: Replace the hardcoded value**

Change:
```ts
contextWindow: 128000,
```
to:
```ts
contextWindow: resolvedContextWindow,
```

Leave `maxTokens: 16384` unchanged for now.

**Step 5: Run tests to verify pass**

Run:
```bash
pnpm --filter cliproxyapi-sync test
```
Expected: all new and existing tests pass.

**Step 6: Commit implementation checkpoint**

```bash
git add pi/extensions/cliproxyapi-sync.ts
git commit -m "feat: derive cliproxyapi-sync contextWindow from codex /v1/models"
```

---

### Task 4: Update README

**TDD scenario:** Trivial change — doc only.

**Files:**
- Modify: `opencode-plugins/cliproxyapi-sync/README.md`

**Step 1: Add a "Model context window" section**

Explain:
- The extension now reads `context_window` from `/v1/models?client_version=1`.
- `slug` in that response matches the model `id` shown in Pi.
- Models not present there fall back to `128000`.
- `maxTokens` is unchanged (no source available).
- Optional: mention `max_context_window` exists but is intentionally not used.

**Step 2: Commit**

```bash
git add opencode-plugins/cliproxyapi-sync/README.md
git commit -m "docs: note context_window source in cliproxyapi-sync README"
```

---

### Task 5: Verify against a live Pi session

**TDD scenario:** Trivial change — verify end to end.

**Step 1: Reload extension**

Inside Pi:
```text
/reload
```

**Step 2: Inspect model list**

Run:
```bash
pi --list-models | rg '^cp-'
```

Expected: `cp-openai` models show varied context windows (e.g. `gpt-5.4` ≠ `gpt-5.5` ≠ `gpt-5.4-mini`) instead of uniform 128k.

**Step 3: Confirm reasoning variants inherit**

Select a `-high` variant and confirm its registered `contextWindow` matches its base model.

**Step 4: Confirm fallback for unmapped models**

Any model whose `slug` is absent from the codex response still registers with `128000` (no crash).

---

## Success criteria

- `pi/extensions/cliproxyapi-sync.ts` no longer hardcodes `contextWindow: 128000` for every model.
- `contextWindow` is read from `/v1/models?client_version=1` via `slug` join, using the `context_window` field (not `max_context_window`).
- Reasoning variants inherit the base model's `contextWindow`.
- Missing entries fall back to `128000` without breaking startup.
- Live `pi --list-models` shows different context windows across `cp-*` models.
- `maxTokens` is intentionally unchanged in this iteration.

## Out of scope

- `maxTokens` enrichment (no reliable source in the codex response).
- Server-side `/v1/models` widening (not needed — the codex branch already covers it).
- Config-based `modelLimits` fallback (deferred; not needed while the codex endpoint is available).

## Key design decisions

- **Source: `/v1/models?client_version=1`.** This is the CLIProxyAPI Codex-format branch, already returned by the running server with no config change.
- **Field: `context_window`**, not `max_context_window`, per explicit user decision.
- **Join key: `slug` == plain `id`.** Verified 1:1 across all 18 live models.
- **Reasoning variants** strip their `-level` suffix before lookup so they inherit the base model's window.
- **Graceful degradation:** any fetch failure, missing `slug`, or non-positive `context_window` falls back to `128000` and logs a warning, matching the existing `fetchModelsDevMetadataByOwner` pattern.

## Risks / open questions

1. The `?client_version=` branch is documented for Codex CLI compatibility. If a future CLIProxyAPI version narrows or renames it, the extension must fall back gracefully (it does, via the empty map → 128000).
2. `context_window` reflects the Codex client's working tier, which may be lower than the model's absolute maximum. This is intentional per the user's choice; revisit if Pi's context meter under-reports capacity.
3. `slug` and `id` are identical today; if they diverge, the join silently falls back to 128000. Low risk, but the README should note the assumption.
