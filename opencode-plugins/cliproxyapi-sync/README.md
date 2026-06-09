# cliproxyapi-sync

OpenCode plugin that syncs `cp-*` providers from a cliproxyapi endpoint into the local OpenCode config.

## Local setup

Link the TypeScript plugin entry into the global OpenCode plugins directory.

```bash
ln -sfn "/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync/cliproxyapi-sync.ts" "/Users/donggeollee/.config/opencode/plugins/cliproxyapi-sync.ts"
```

## Plugin config

On first startup the plugin bootstraps `~/.config/opencode/cliproxyapi-sync-config.jsonc` if it does not already exist.

```jsonc
{
  // CLI Proxy API base URL, usually ending with /v1
  "baseURL": "http://localhost:8317/v1",

  // API key used for /v1/models
  "apiKey": "",

  // Optional. If omitted, plugin falls back to its default management key.
  "managementKey": "",

  // Optional for the local pi extension variant. Adds visible -low/-medium/-high aliases.
  // The proxy must also understand these aliased model names at request time.
  "reasoningVariants": {
    "gpt-5.5": ["low", "medium", "high"],
    "openai/gpt-5.4": ["low", "medium", "high", "xhigh"],
    "deepseek/deepseek-v4-pro": ["low", "medium", "high"]
  }
}
```

Fill `baseURL` and `apiKey` in that file instead of adding `provider.cliproxyapi` to `~/.config/opencode/opencode.json`.

If an older `provider.cliproxyapi` entry is still present, the plugin migrates it into `cliproxyapi-sync-config.jsonc` automatically and removes the legacy entry from `opencode.json`.

## Reasoning aliases for pi sessions

The local pi extension variant can expose virtual reasoning model names by using `reasoningVariants` in `~/.config/opencode/cliproxyapi-sync-config.jsonc`.

For example, if `/v1/models` returns `openai/gpt-5.5` and the config contains:

```jsonc
{
  "reasoningVariants": {
    "gpt-5.5": ["low", "medium", "high"]
  }
}
```

then pi will also see:

- `openai/gpt-5.5-low`
- `openai/gpt-5.5-medium`
- `openai/gpt-5.5-high`

These aliases are only provider/model-list entries. The proxy must translate them before forwarding the upstream request. A typical request-time mapping is:

```ts
type ReasoningAlias = {
  model: string
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh"
}

const REASONING_SUFFIX_RE = /-(minimal|low|medium|high|xhigh)$/i

export function resolveReasoningAlias(model: string): ReasoningAlias {
  const match = model.match(REASONING_SUFFIX_RE)
  if (!match) return { model }

  return {
    model: model.slice(0, -match[0].length),
    reasoningEffort: match[1].toLowerCase() as ReasoningAlias["reasoningEffort"],
  }
}
```

Apply it in the proxy before calling the upstream provider:

```ts
const resolved = resolveReasoningAlias(requestBody.model)

const upstreamBody = {
  ...requestBody,
  model: resolved.model,
  ...(resolved.reasoningEffort
    ? { reasoning_effort: resolved.reasoningEffort }
    : {}),
}
```

With that proxy-side mapping, selecting `openai/gpt-5.5-high` in pi sends the upstream model as `openai/gpt-5.5` with `reasoning_effort: "high"`.
