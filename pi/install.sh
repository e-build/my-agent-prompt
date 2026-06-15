#!/usr/bin/env bash
set -euo pipefail

# Install Pi resources from my-agent-prompt/pi/ to ~/.pi/agent
#
# Resources managed here:
#   pi/extensions/        ← 외부 참고 Pi extension들
#   pi/themes/            ← Pi 테마 10종
#   pi/config/            ← 설정 예시 (settings, mcp)
#   pi/bin/pi             ← 컴팩트 Pi 런처
#
# cliproxyapi-sync.ts는 pi-extensions/install-local.sh 로 별도 관리
# skills/ 는 Pi 전용이 아닌 모든 에이전트 공용 → 이 스크립트에서 제외

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # repo root = my-agent-prompt
PI_DIR="$ROOT/pi"
PI_HOME="${PI_HOME:-$HOME/.pi/agent}"
COPY_CONFIG=0
RESTORE=0

usage() {
  cat <<'EOF'
Usage:
  bash pi/install.sh                      # compact launcher + sync helper only
  bash pi/install.sh --copy-config        # also copy example settings/mcp
  bash pi/install.sh --restore            # also restore pi/extensions/ and pi/themes/
  bash pi/install.sh --restore --copy-config  # full install
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --copy-config) COPY_CONFIG=1; shift ;;
    --restore)     RESTORE=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

mkdir -p "$PI_HOME"

# --- Restore pi/extensions/ and pi/themes/ ---
if [[ "$RESTORE" == "1" ]]; then
  echo "Restoring pi/ resources → $PI_HOME"

  if [[ -d "$PI_DIR/extensions" && "$(ls -A "$PI_DIR/extensions" 2>/dev/null)" ]]; then
    mkdir -p "$PI_HOME/extensions"
    cp -R "$PI_DIR/extensions"/. "$PI_HOME/extensions/" 2>/dev/null || true
    echo "  ✓ pi/extensions/ restored"
  fi

  if [[ -d "$PI_DIR/themes" && "$(ls -A "$PI_DIR/themes" 2>/dev/null)" ]]; then
    mkdir -p "$PI_HOME/themes"
    cp -R "$PI_DIR/themes"/. "$PI_HOME/themes/" 2>/dev/null || true
    echo "  ✓ pi/themes/ restored"
  fi

  echo ""
  echo "  Tip: don't forget to also install pi-extensions for cliproxyapi-sync:"
  echo "    bash pi-extensions/install-local.sh"
else
  echo "Skipping resource restore. Use --restore to copy extensions and themes."
fi

# --- Copy example config ---
if [[ "$COPY_CONFIG" == "1" ]]; then
  echo "Copying example config → $PI_HOME/"
  if [[ -f "$PI_DIR/config/settings.example.json" ]]; then
    cp "$PI_DIR/config/settings.example.json" "$PI_HOME/settings.json"
    echo "  ✓ settings.json (edit model info after install!)"
  fi
  if [[ -f "$PI_DIR/config/mcp.example.json" ]]; then
    cp "$PI_DIR/config/mcp.example.json" "$PI_HOME/mcp.json"
    echo "  ✓ mcp.json"
  fi
else
  echo "Skipping config copy. Use --copy-config to copy settings/mcp examples."
fi

# --- Install compact launcher ---
if [[ -f "$PI_DIR/bin/pi" ]]; then
  mkdir -p "$HOME/.local/bin"
  cp "$PI_DIR/bin/pi" "$HOME/.local/bin/pi"
  chmod +x "$HOME/.local/bin/pi"
  echo "Installed compact Pi launcher: $HOME/.local/bin/pi"
fi

# --- Install sync helper (global) ---
if [[ -f "$PI_DIR/sync.sh" ]]; then
  mkdir -p "$HOME/.local/bin"
  cp "$PI_DIR/sync.sh" "$HOME/.local/bin/my-agent-prompt-pi-sync"
  chmod +x "$HOME/.local/bin/my-agent-prompt-pi-sync"
  echo "Installed sync helper: $HOME/.local/bin/my-agent-prompt-pi-sync"
fi

echo ""
echo "✅ Done! Restart Pi or run /reload."
echo ""
echo "Next steps:"
echo "  1. Edit ~/.pi/agent/settings.json to set your model/provider and theme"
echo "  2. Run /reload or restart Pi"
echo "  3. bash pi-extensions/install-local.sh   (for cliproxyapi-sync)"
echo "  4. After changes: my-agent-prompt-pi-sync"
