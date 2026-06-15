#!/usr/bin/env bash
set -euo pipefail

# Sync ~/.pi/agent → my-agent-prompt/pi/
#
# This syncs Pi themes, extensions, and example config files back into the repo.
# cliproxyapi-sync.ts is deliberately excluded — it is symlinked from pi/extensions/
# so ci (cp -R) would replace the symlink with a copy.

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd 2>/dev/null || cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_DIR="$ROOT/pi"
PI_HOME="${PI_HOME:-$HOME/.pi/agent}"
COMMIT_MSG="${1:-"chore(pi): sync Pi setup $(date +%Y-%m-%d-%H%M)"}"
NO_PUSH=false

for arg in "$@"; do
  case "$arg" in
    --no-push) NO_PUSH=true ;;
    --help) echo "Usage: sync.sh [commit message] [--no-push]"; exit 0 ;;
  esac
done

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
  cp "$PI_HOME/settings.json" "$PI_DIR/config/settings.example.json"
  echo "  ✓ settings.example.json synced"
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
