# cliproxyapi-sync

OpenCode plugin that syncs `cp-*` providers from a cliproxyapi endpoint into the local OpenCode config.

## Local setup

Build the plugin bundle first.

```bash
bun run build
```

Then link the built plugin into the global OpenCode plugins directory.

```bash
ln -sfn "/Users/donggeollee/IdeaProjects/ebuild-github/my-agent-prompt/opencode-plugins/cliproxyapi-sync/dist/index.js" "/Users/donggeollee/.config/opencode/plugins/cliproxyapi-sync.js"
```

If `~/.config/opencode/opencode.json` still contains the plugin bundle path in its `plugin` array, remove that entry so the plugin is managed from `~/.config/opencode/plugins/` instead.
