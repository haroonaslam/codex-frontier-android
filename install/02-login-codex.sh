#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

APP_HOME="/data/data/com.termux/files/home/codex-subscription-isolated-app"
CODEX_HOME_DIR="$APP_HOME/runtime/.codex"
ISOLATED_HOME="$APP_HOME/runtime/home"
PROXY_PORT=5903
PROXY_PID=""

fail() {
  printf '\nLOGIN_FAILED: %s\n' "$1" >&2
  exit 1
}

[ "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)" = "$APP_HOME" ] || fail "repository must be installed at $APP_HOME"
cd "$APP_HOME"

test -x ./bin/codex || fail "Codex is not installed; run ./install/01-bootstrap-termux.sh first"
test -f ./vendor/codex-cli-frontier/node_modules/@openai/codex-linux-arm64/package.json || fail "Codex ARM64 runtime is missing"

./install/ensure-user-workspace.sh
mkdir -p "$CODEX_HOME_DIR" "$ISOLATED_HOME" "$CODEX_HOME_DIR/logs"
if [ ! -f "$CODEX_HOME_DIR/config.toml" ]; then
  cp runtime-template/.codex/config.toml "$CODEX_HOME_DIR/config.toml"
fi
chmod 600 "$CODEX_HOME_DIR/config.toml"

stop_proxy() {
  if [ -n "$PROXY_PID" ]; then
    kill -TERM "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
}
trap stop_proxy EXIT INT TERM

CODEX_DNS_PROXY_PORT="$PROXY_PORT" node ./bin/termux-connect-proxy.mjs \
  >> "$CODEX_HOME_DIR/logs/installer-dns-proxy.log" 2>&1 &
PROXY_PID=$!

attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl -sS --connect-timeout 1 --max-time 2 -o /dev/null \
      --proxy "http://127.0.0.1:$PROXY_PORT" https://auth.openai.com/ 2>/dev/null; then
    break
  fi
  kill -0 "$PROXY_PID" 2>/dev/null || fail "the Android DNS bridge stopped unexpectedly"
  attempt=$((attempt + 1))
  sleep 1
done
[ "$attempt" -lt 30 ] || fail "the Android DNS bridge did not become ready"

export HOME="$ISOLATED_HOME"
export CODEX_HOME="$CODEX_HOME_DIR"
export HTTPS_PROXY="http://127.0.0.1:$PROXY_PORT"
export https_proxy="$HTTPS_PROXY"
export SSL_CERT_FILE="/data/data/com.termux/files/usr/etc/tls/cert.pem"
export NO_PROXY="127.0.0.1,localhost"
export no_proxy="$NO_PROXY"

if ./bin/codex login status 2>&1 | grep -Fq 'Logged in using ChatGPT'; then
  printf '%s\n' "An isolated ChatGPT Codex login already exists; keeping it."
else
  printf '%s\n' \
    "Codex will show a web address and a one-time code." \
    "Open that address in Android, sign in to ChatGPT, and approve the code." \
    "If device-code login is disabled, enable it in ChatGPT Security Settings first."
  ./bin/codex login --device-auth
fi

./bin/codex login status 2>&1 | grep -Fq 'Logged in using ChatGPT' || fail "ChatGPT login was not confirmed"
node ./install/hydrate-model-cache.mjs

chmod 600 "$CODEX_HOME_DIR/auth.json" "$CODEX_HOME_DIR/config.toml" "$CODEX_HOME_DIR/models_cache.json"
./isolation-preflight.sh

printf '\n%s\n' \
  "Codex subscription login is ready." \
  "Now run: ./install/03-finish-setup.sh"
