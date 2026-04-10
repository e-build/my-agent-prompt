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
  "managementKey": ""
}
```

Fill `baseURL` and `apiKey` in that file instead of adding `provider.cliproxyapi` to `~/.config/opencode/opencode.json`.

If an older `provider.cliproxyapi` entry is still present, the plugin migrates it into `cliproxyapi-sync-config.jsonc` automatically and removes the legacy entry from `opencode.json`.
