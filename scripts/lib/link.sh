# Shared link helper for install scripts. Source it; do not execute.
#
# link_dir SRC DST — point DST at directory SRC (SRC may be relative to DST's
# parent, like `ln -s`).
#
# On Windows Git Bash, plain `ln -s` silently copies the target instead of
# linking it, so installed resources go stale and later runs mistake the copy
# for a user-managed directory. There we try a native symlink first (needs
# Developer Mode) and fall back to a directory junction (no admin rights).
# Git Bash reports junctions as symlinks, so `[[ -L ]]` guards still work.

is_windows() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
  esac
  return 1
}

link_dir() {
  local src="$1" dst="$2" abs
  if ! is_windows; then
    ln -sfn "$src" "$dst"
    return
  fi

  abs="$(cd "$(dirname "$dst")" && cd "$src" && pwd)"
  [[ -L "$dst" ]] && rm -f "$dst"
  if MSYS=winsymlinks:nativestrict ln -sfn "$abs" "$dst" 2>/dev/null; then
    return
  fi
  cmd //c mklink //J "$(cygpath -w "$dst")" "$(cygpath -w "$abs")" >/dev/null
}

# link_shared AGENTS_HOME ROOT — expose shared command bodies and templates at
# fixed paths (~/.agents/commands, ~/.agents/templates) so wrappers and command
# bodies can reference them from any project, wherever this repo is cloned.
link_shared() {
  local agents_home="$1" root="$2" name
  mkdir -p "$agents_home"
  for name in commands templates; do
    # Guard: never touch a real (non-symlink) directory the user manages.
    if [[ -e "$agents_home/$name" && ! -L "$agents_home/$name" ]]; then
      echo "  ⚠ skipped $name: real path exists at $agents_home/$name (user-managed)"
      continue
    fi
    link_dir "$root/resources/$name" "$agents_home/$name"
    echo "  ✓ shared $name → $agents_home/$name"
  done
}
