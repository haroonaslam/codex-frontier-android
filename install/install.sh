#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

APP_HOME="/data/data/com.termux/files/home/codex-subscription-isolated-app"
BOOTSTRAP_URL="https://raw.githubusercontent.com/haroonaslam/codex-frontier-android/main/install/01-bootstrap-termux.sh"

temporary_script="$(mktemp)"
cleanup() {
  rm -f "$temporary_script"
}
trap cleanup EXIT INT TERM

printf '%s\n' \
  "Codex Frontier Android installer" \
  "This installs a project-local backend, then asks you to sign into Codex." \
  "No API key, desktop computer, or PRoot distribution is required."

if [ -x "$APP_HOME/install/01-bootstrap-termux.sh" ]; then
  "$APP_HOME/install/01-bootstrap-termux.sh"
else
  command -v curl >/dev/null 2>&1 || {
    pkg update -y
    pkg install -y curl
  }
  curl -fL --retry 3 --output "$temporary_script" "$BOOTSTRAP_URL"
  /data/data/com.termux/files/usr/bin/bash "$temporary_script"
fi

cd "$APP_HOME"
./install/02-login-codex.sh
./install/03-finish-setup.sh
