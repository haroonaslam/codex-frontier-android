#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

APP_HOME="/data/data/com.termux/files/home/codex-subscription-isolated-app"
RUNTIME="$APP_HOME/bin/codex_runtime.py"

[ -x "$RUNTIME" ] || {
  printf 'CAPABILITY_LINKS_FAILED: missing executable %s\n' "$RUNTIME" >&2
  exit 1
}

commands='codex-route codex-exec codex-search codex-source codex-fetch codex-download codex-acquire codex-install codex-update codex-delete codex-restore codex-fs codex-pm codex-android codex-privilege codex-provision codex-net codex-protocol codex-media codex-ocr codex-speech codex-vault codex-memory codex-schedule codex-health codex-audit codex-undo codex-win codex-github codex-job codex-goal codex-capability codex-verify codex-recover codex-browser codex-ui codex-network codex-artifact codex-package codex-account codex-entitlement codex-todoist codex-action codex-app codex-notification'

for command in $commands; do
  destination="$APP_HOME/bin/$command"
  if [ -L "$destination" ] && [ "$(readlink "$destination")" = "codex_runtime.py" ]; then
    continue
  fi
  if [ -e "$destination" ] || [ -L "$destination" ]; then
    printf 'CAPABILITY_LINKS_FAILED: refusing to replace %s\n' "$destination" >&2
    exit 1
  fi
  ln -s codex_runtime.py "$destination"
done

printf 'CAPABILITY_LINKS_READY\n'
