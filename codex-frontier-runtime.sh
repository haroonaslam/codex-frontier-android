#!/data/data/com.termux/files/usr/bin/bash
set -eu

APP_HOME="/data/data/com.termux/files/home/codex-subscription-isolated-app"
PROXY="$APP_HOME/bin/termux-connect-proxy.mjs"
PROXY_PORT=5903
LOG_DIR="$APP_HOME/runtime/.codex/logs"

mkdir -p "$LOG_DIR"

CODEX_DNS_PROXY_PORT="$PROXY_PORT" \
  /data/data/com.termux/files/usr/bin/node "$PROXY" \
  >> "$LOG_DIR/dns-proxy.log" 2>&1 &
proxy_pid=$!

cleanup() {
  kill -TERM "$proxy_pid" 2>/dev/null || true
  wait "$proxy_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl -sS --connect-timeout 1 --max-time 2 -o /dev/null \
      --proxy "http://127.0.0.1:$PROXY_PORT" \
      "https://auth.openai.com/" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$proxy_pid" 2>/dev/null; then
    printf 'Termux DNS bridge exited before becoming ready\n' >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done
[ "$attempt" -lt 30 ] || { printf 'Termux DNS bridge did not become ready\n' >&2; exit 1; }

export HTTPS_PROXY="http://127.0.0.1:$PROXY_PORT"
export https_proxy="$HTTPS_PROXY"
export SSL_CERT_FILE="/data/data/com.termux/files/usr/etc/tls/cert.pem"
export NO_PROXY="127.0.0.1,localhost"
export no_proxy="$NO_PROXY"

/data/data/com.termux/files/usr/bin/node "$@" &
runtime_pid=$!
wait "$runtime_pid"
