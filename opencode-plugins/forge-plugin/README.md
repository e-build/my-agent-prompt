# forge-plugin

Lightweight OpenCode multi-agent harness plugin based on the Forge design spec.

## Features

- Five registered agents: `pilot`, `planner`, `architect`, `worker`, `scouter`
- Category-based model routing through the `chat.message` hook
- User and project config loading from `~/.config/opencode/forge.jsonc` and `.forge/config.jsonc`
- `start_work` tool plus `/start-work` command registration for plan-driven execution
- Worker delegation blocked through agent permissions (`task: "deny"`)

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
