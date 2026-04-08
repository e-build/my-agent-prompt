# forge-plugin

Lightweight OpenCode multi-agent harness plugin based on the Forge design spec.

## Features

- Five registered agents: `pilot`, `planner`, `architect`, `worker`, `scouter`
- Agent-based model routing through the `chat.message` hook
- User and project config loading from `~/.config/opencode/forge.jsonc` and `.forge/config.jsonc`
- `start_work` tool plus `/start-work` command registration for plan-driven execution
- `recommend_models` and `bind_models` tools plus `/forge-models` for recommended model bindings
- Worker delegation blocked through agent permissions (`task: "deny"`)

## Model Configuration

Forge resolves models in this order:

```text
agent model override -> agent default model
```

Configure agent models in `~/.config/opencode/forge.jsonc` for user defaults or
`.forge/config.jsonc` for a project override:

```jsonc
{
  "agents": {
    "pilot": { "model": "cp-openai/gpt-5.4" },
    "planner": { "model": "cp-openai/gpt-5.4" },
    "architect": { "model": "cp-openai/gpt-5.4" },
    "worker": { "model": "cp-github-copilot/claude-sonnet-4.6" },
    "scouter": { "model": "cp-github-copilot/claude-haiku-4.5" }
  }
}
```

Run `/forge-models` to ask Forge for recommendations based on `opencode models --pure`.
Forge will only write `.forge/config.jsonc` through `bind_models` when the user explicitly
approves binding the recommended models.

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
