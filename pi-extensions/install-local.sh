#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
EXT_DIR="$PI_DIR/extensions"
MODE="install"
FORCE="0"

for arg in "$@"; do
  case "$arg" in
    --uninstall)
      MODE="uninstall"
      ;;
    --force)
      FORCE="1"
      ;;
    *)
      echo "unknown option: $arg" >&2
      echo "usage: $0 [--force] [--uninstall]" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$EXT_DIR"

link_file() {
  local src="$1"
  local dest="$2"

  if [[ -L "$dest" || ! -e "$dest" ]]; then
    ln -sfn "$src" "$dest"
    echo "linked: $dest -> $src"
  elif [[ "$FORCE" == "1" ]]; then
    local backup="${dest}.bak.$(date +%Y%m%d%H%M%S)"
    mv "$dest" "$backup"
    ln -sfn "$src" "$dest"
    echo "backed up: $dest -> $backup"
    echo "linked: $dest -> $src"
  else
    echo "skip: $dest exists and is not a symlink (use --force to back up and replace)" >&2
  fi
}

unlink_file() {
  local dest="$1"

  if [[ -L "$dest" ]]; then
    rm "$dest"
    echo "removed: $dest"
  fi
}

shopt -s nullglob
for src in "$REPO_DIR"/*.ts; do
  dest="$EXT_DIR/$(basename "$src")"
  if [[ "$MODE" == "install" ]]; then
    link_file "$src" "$dest"
  else
    unlink_file "$dest"
  fi
done

for src in "$REPO_DIR"/*; do
  [[ -d "$src" && -f "$src/index.ts" ]] || continue
  dest="$EXT_DIR/$(basename "$src")"
  if [[ "$MODE" == "install" ]]; then
    link_file "$src" "$dest"
  else
    unlink_file "$dest"
  fi
done
