#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

TERMUX_HOME="/data/data/com.termux/files/home"
APP_HOME="$TERMUX_HOME/codex-subscription-isolated-app"
USER_WORKSPACE="$TERMUX_HOME/codex-workspace"
LEGACY_WORKSPACE="$APP_HOME/workspace"
INSTRUCTIONS_TEMPLATE="$APP_HOME/runtime-template/workspace/AGENTS.md"
CODEX_CONFIG="$APP_HOME/runtime/.codex/config.toml"
GLOBAL_INSTRUCTIONS_TEMPLATE="$APP_HOME/runtime-template/.codex/AGENTS.md"
GLOBAL_INSTRUCTIONS="$APP_HOME/runtime/.codex/AGENTS.md"
DEVELOPMENT_TEMPLATE="$APP_HOME/DEVELOPMENT.md"
EDITABLE_DEVELOPMENT="$APP_HOME/runtime/.codex/DEVELOPMENT.md"
LEGACY_PROJECT_HEADER='[projects."/data/data/com.termux/files/home/codex-subscription-isolated-app/workspace"]'

[ -f "$INSTRUCTIONS_TEMPLATE" ] || {
  printf 'WORKSPACE_SETUP_FAILED: missing workspace instructions template\n' >&2
  exit 1
}
[ -f "$DEVELOPMENT_TEMPLATE" ] || {
  printf 'WORKSPACE_SETUP_FAILED: missing development reference\n' >&2
  exit 1
}
[ -f "$GLOBAL_INSTRUCTIONS_TEMPLATE" ] || {
  printf 'WORKSPACE_SETUP_FAILED: missing global instructions template\n' >&2
  exit 1
}

# Older releases stored user projects inside the application checkout. Move the
# directory intact on first upgrade, then retain its old path as a compatibility
# link so existing sessions keep their original cwd working.
if [ -d "$LEGACY_WORKSPACE" ] && [ ! -L "$LEGACY_WORKSPACE" ] && [ ! -e "$USER_WORKSPACE" ]; then
  mv "$LEGACY_WORKSPACE" "$USER_WORKSPACE"
fi

mkdir -p "$USER_WORKSPACE"
mkdir -p "$APP_HOME/runtime/.codex"

if [ ! -e "$LEGACY_WORKSPACE" ]; then
  ln -s "$USER_WORKSPACE" "$LEGACY_WORKSPACE"
elif [ -L "$LEGACY_WORKSPACE" ]; then
  [ "$(readlink -f -- "$LEGACY_WORKSPACE")" = "$USER_WORKSPACE" ] || {
    printf 'WORKSPACE_SETUP_FAILED: legacy workspace link has an unexpected target\n' >&2
    exit 1
  }
elif [ -d "$LEGACY_WORKSPACE" ]; then
  printf 'WORKSPACE_SETUP_FAILED: both legacy and external workspaces exist; merge them manually before updating\n' >&2
  exit 1
else
  printf 'WORKSPACE_SETUP_FAILED: legacy workspace path is not a directory\n' >&2
  exit 1
fi

if [ ! -e "$USER_WORKSPACE/AGENTS.md" ]; then
  cp "$INSTRUCTIONS_TEMPLATE" "$USER_WORKSPACE/AGENTS.md"
fi

if [ ! -s "$GLOBAL_INSTRUCTIONS" ]; then
  cp "$GLOBAL_INSTRUCTIONS_TEMPLATE" "$GLOBAL_INSTRUCTIONS"
fi

# The viewer/editor uses an untracked runtime copy so personal notes never make
# the Git checkout dirty or block a later installer update.
if [ ! -e "$EDITABLE_DEVELOPMENT" ]; then
  cp "$DEVELOPMENT_TEMPLATE" "$EDITABLE_DEVELOPMENT"
fi

if [ -f "$CODEX_CONFIG" ] && grep -Fq "$LEGACY_PROJECT_HEADER" "$CODEX_CONFIG"; then
  sed -i 's|^\[projects\."/data/data/com\.termux/files/home/codex-subscription-isolated-app/workspace"\]$|[projects."/data/data/com.termux/files/home/codex-workspace"]|' "$CODEX_CONFIG"
fi

printf 'USER_WORKSPACE_READY %s\n' "$USER_WORKSPACE"
