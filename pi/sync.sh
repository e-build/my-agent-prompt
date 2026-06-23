#!/usr/bin/env bash
set -euo pipefail

# Sync ~/.pi/agent → my-agent-prompt/pi/
#
# This syncs Pi themes, extensions, and example config files back into the repo.
# cliproxyapi-sync.ts is deliberately excluded — it is symlinked from pi/extensions/
# so ci (cp -R) would replace the symlink with a copy.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_DIR="$ROOT/pi"
PI_HOME="${PI_HOME:-$HOME/.pi/agent}"
COMMIT_MSG=""
NO_PUSH=false

for arg in "$@"; do
  case "$arg" in
    --no-push) NO_PUSH=true ;;
    --help) echo "Usage: sync.sh [commit message] [--no-push]"; exit 0 ;;
    *) COMMIT_MSG="$arg" ;;
  esac
done

COMMIT_MSG="${COMMIT_MSG:-chore(pi): sync Pi setup $(date +%Y-%m-%d-%H%M)}"

echo "Syncing ~/.pi/agent → $PI_DIR"

# --- Themes ---
if [[ -d "$PI_HOME/themes" ]]; then
  mkdir -p "$PI_DIR/themes"
  cp -R "$PI_HOME/themes"/. "$PI_DIR/themes/" 2>/dev/null || true
  echo "  ✓ themes synced"
fi

# --- Extensions (exclude cliproxyapi-sync.ts — it's symlinked) ---
if [[ -d "$PI_HOME/extensions" ]]; then
  mkdir -p "$PI_DIR/extensions"
  # Sync all except cliproxyapi-sync.ts
  for item in "$PI_HOME/extensions"/*; do
    base="$(basename "$item")"
    [[ "$base" == "cliproxyapi-sync.ts" ]] && continue
    [[ "$base" == ".pi" ]] && continue
    [[ "$base" == "pi-rtk-optimizer" ]] && continue
    cp -R "$item" "$PI_DIR/extensions/" 2>/dev/null || true
  done
  echo "  ✓ extensions synced (cliproxyapi-sync.ts excluded)"
fi

# --- Config (sanitized examples) ---
if [[ -f "$PI_HOME/settings.json" ]]; then
  python3 - "$PI_HOME/settings.json" "$PI_DIR/config/settings.example.json" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
with open(src, 'r', encoding='utf-8') as f:
    data = json.load(f)
data.pop('prompts', None)
with open(dst, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write('\n')
PY
  echo "  ✓ settings.example.json synced (sanitized)"
fi
if [[ -f "$PI_HOME/mcp.json" ]]; then
  cp "$PI_HOME/mcp.json" "$PI_DIR/config/mcp.example.json"
  echo "  ✓ mcp.example.json synced"
fi

# --- Compact launcher (if changed upstream) ---
if [[ -f "$PI_DIR/bin/pi" && -f "$HOME/.local/bin/pi" ]]; then
  cp "$HOME/.local/bin/pi" "$PI_DIR/bin/pi" 2>/dev/null || true
fi

cd "$ROOT"

# Check if git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "Not a git repository. Skipping commit."
  exit 0
fi

# Stage only pi/ changes
git add pi/
if git diff --cached --quiet; then
  echo "No changes to commit in pi/."
else
  git commit -m "$COMMIT_MSG"
  echo "Committed: $COMMIT_MSG"
  if [[ "$NO_PUSH" == false ]]; then
    git push
    echo "Pushed to remote."
  else
    echo "Skipped push (--no-push)."
  fi
fi

echo "✅ Pi sync complete."
