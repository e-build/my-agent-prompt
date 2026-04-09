# forge-plugin

Lightweight OpenCode multi-agent harness plugin based on the Forge design spec.

## Features

- Six registered agents: `pilot`, `planner`, `architect`, `worker`, `scouter`, `researcher`
- Agent-based model routing through the `chat.message` hook
- User and project config loading from `~/.config/opencode/forge-config.jsonc` and `.forge/config.jsonc`
- `start_work` tool plus `/start-work` command registration for plan-driven execution
- `recommend_models` and `bind_models` tools plus `/forge-models` for recommended model bindings
- Worker delegation blocked through agent permissions (`task: "deny"`)
- Hidden specialist subagents for codebase exploration (`scouter`) and external documentation research (`researcher`)
- Optional builtin OpenCode agent suppression for `build`, `plan`, `general`, and `explore`

## Model Configuration

Forge resolves models in this order:

```text
project agent override -> user agent default -> built-in agent default
```

## Config Reference

Forge reads two config files:

- User config: `~/.config/opencode/forge-config.jsonc`
- Project config: `.forge/config.jsonc`

The user config defines defaults for every project. The project config overrides those defaults for the current repository only.

### Config Shape

```jsonc
{
  "disable_builtin_agents": true,
  "disabled_agents": ["architect"],
  "agents": {
    "pilot": {
      "model": "cp-openai/gpt-5.4",
      "prompt_append": "Keep plans short."
    },
    "worker": {
      "model": "cp-github-copilot/claude-sonnet-4.6",
      "fallback_models": ["cp-openai/gpt-5.4", "cp-openai/gpt-5-mini"],
      "prompt_append": "Prefer small diffs."
    }
  }
}
```

### Top-Level Fields

- `disable_builtin_agents`: boolean. Hides builtin OpenCode agents `build`, `plan`, `general`, and `explore` when set to `true`.
- `disabled_agents`: string array. Disables specific Forge agents such as `architect` or `researcher`.
- `agents`: object keyed by Forge agent name.

Supported Forge agent keys:

- `pilot`
- `planner`
- `architect`
- `worker`
- `scouter`
- `researcher`

### Per-Agent Fields

- `model`: string. Primary model for the agent. Format: `provider/model`.
- `fallback_models`: string array, optional, maximum 2 entries. Retry chain used only for retryable runtime failures.
- `prompt_append`: string, optional. Additional prompt text appended to that Forge agent.

### Config Examples

User-level defaults:

```jsonc
{
  "disable_builtin_agents": true,
  "agents": {
    "pilot": { "model": "cp-openai/gpt-5.4" },
    "planner": { "model": "cp-openai/gpt-5.4" },
    "architect": { "model": "cp-openai/gpt-5.4" },
    "worker": {
      "model": "cp-github-copilot/claude-sonnet-4.6",
      "fallback_models": ["cp-openai/gpt-5.4"]
    },
    "scouter": { "model": "cp-github-copilot/claude-haiku-4.5" },
    "researcher": { "model": "cp-openai/gpt-5.4" }
  }
}
```

Project-level override:

```jsonc
{
  "agents": {
    "worker": {
      "model": "cp-openai/gpt-5-codex",
      "fallback_models": []
    },
    "pilot": {
      "prompt_append": "Always summarize decisions at the end."
    }
  }
}
```

Configure agent models in `~/.config/opencode/forge-config.jsonc` for user defaults or
`.forge/config.jsonc` for a project override:

```jsonc
{
  "agents": {
    "pilot": { "model": "cp-openai/gpt-5.4" },
    "planner": { "model": "cp-openai/gpt-5.4" },
    "architect": { "model": "cp-openai/gpt-5.4" },
    "worker": {
      "model": "cp-github-copilot/claude-sonnet-4.6",
      "fallback_models": ["cp-openai/gpt-5.4", "cp-openai/gpt-5-mini"]
    },
    "scouter": { "model": "cp-github-copilot/claude-haiku-4.5" },
    "researcher": { "model": "cp-openai/gpt-5.4" }
  }
}
```

`fallback_models` is optional and supports up to two entries per agent.

### Override Semantics

- User `~/.config/opencode/forge-config.jsonc` provides the default route.
- Project `.forge/config.jsonc` overrides user defaults explicitly.
- If a project override sets `model`, inherited user `fallback_models` are not reused automatically.
- If a project wants fallbacks for an overridden model, it must set `fallback_models` explicitly.
- `fallback_models: []` explicitly disables inherited fallbacks while keeping the inherited model.
- If a project only changes `prompt_append`, the inherited `model` and `fallback_models` remain in effect.

Effective behavior examples:

| User config | Project config | Effective result |
| --- | --- | --- |
| `model=A`, `fallbacks=[B]` | none | `model=A`, `fallbacks=[B]` |
| `model=A`, `fallbacks=[B]` | `prompt_append=X` | `model=A`, `fallbacks=[B]`, `prompt_append=X` |
| `model=A`, `fallbacks=[B]` | `model=C` | `model=C`, `fallbacks=[]` |
| `model=A`, `fallbacks=[B]` | `model=C`, `fallbacks=[D]` | `model=C`, `fallbacks=[D]` |
| `model=A`, `fallbacks=[B]` | `fallbacks=[]` | `model=A`, `fallbacks=[]` |

Example: disable inherited fallbacks for a project-specific worker model.

```jsonc
{
  "agents": {
    "worker": {
      "model": "cp-openai/gpt-5-codex",
      "fallback_models": []
    }
  }
}
```

### Runtime Fallback Behavior

Forge only triggers fallback on retryable API failures such as:

- `429`
- `500`, `502`, `503`, `504`
- timeout and transient network/provider availability failures

Forge does not fallback for configuration mistakes such as missing API keys, invalid model names, or auth errors.

When a retryable failure occurs, Forge replays the last user text prompt in the same session with the next configured fallback model. If no retry payload can be reconstructed, the fallback remains armed and will be used on the next Forge agent message for that same session and agent.

Run `/forge-models` to ask Forge for recommendations based on `opencode models --pure`.
Forge will only write `.forge/config.jsonc` through `bind_models` when the user explicitly
approves binding the recommended models. `bind_models` only updates primary `model` assignments and preserves any manual `fallback_models` already present in `.forge/config.jsonc`.

## Builtin Agent Toggle

If you want Forge to hide the builtin OpenCode agents and expose only Forge agents,
enable the project or user toggle below:

```jsonc
{
  "disable_builtin_agents": true
}
```

When enabled, forge-plugin injects `disable: true` for the builtin OpenCode agents
`build`, `plan`, `general`, and `explore` during config registration.

## User Config Bootstrap

When forge-plugin loads for the first time, it automatically creates
`~/.config/opencode/forge-config.jsonc` if the file does not already exist.

- The file is created once as a JSONC template.
- Existing `forge-config.jsonc` files are never overwritten.
- Existing user config files are not auto-migrated when new fallback fields are introduced.

## Development

```bash
bun install
bun test
bun run build
```

## Local OpenCode Registration

Add the built package root to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "/absolute/path/to/opencode-plugins/forge-plugin"
  ]
}
```

Build first so `dist/index.js` exists.
