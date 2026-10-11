#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

APP_HOME="/data/data/com.termux/files/home/codex-subscription-isolated-app"
MANIFEST="$APP_HOME/release-manifest.json"

fail() {
  printf '\nSETUP_FAILED: %s\n' "$1" >&2
  exit 1
}

[ "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)" = "$APP_HOME" ] || fail "repository must be installed at $APP_HOME"
cd "$APP_HOME"

./isolation-preflight.sh
./codex-frontier-stop.sh >/dev/null 2>&1 || true
./codex-frontier-start.sh

attempt=0
while [ "$attempt" -lt 90 ]; do
  if curl -fsS --connect-timeout 1 --max-time 2 \
      http://127.0.0.1:5902/codex-api/meta/methods >/dev/null 2>&1; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

[ "$attempt" -lt 90 ] || fail "the backend did not become healthy within 90 seconds; inspect runtime/.codex/logs"

readarray -t release_values < <(python - "$MANIFEST" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
print(payload["apk"]["asset"])
print(payload["apk"]["url"])
print(payload["apk"]["sha256"])
PY
)

apk_asset="${release_values[0]}"
apk_url="${release_values[1]}"
apk_sha256="${release_values[2]}"
apk_path="$APP_HOME/dist/$apk_asset"

mkdir -p "$APP_HOME/dist"
printf '\nDownloading the signed Android app...\n'
curl -fL --retry 3 --output "$apk_path" "$apk_url"
actual_sha256="$(sha256sum "$apk_path" | awk '{print $1}')"
[ "$actual_sha256" = "$apk_sha256" ] || fail "downloaded APK SHA-256 did not match the release manifest"

PYTHONDONTWRITEBYTECODE=1 python -m unittest \
  tests.test_android_installer \
  tests.test_android_semantic \
  tests.test_tablet_variant

command -v termux-reload-settings >/dev/null 2>&1 && termux-reload-settings >/dev/null 2>&1 || true

printf '\n%s\n' \
  "BACKEND_READY" \
  "The APK signature hash is verified." \
  "Android will now open its package installer." \
  "If prompted, allow Termux to install unknown apps, then tap Install." \
  "After installation, open Codex Frontier and grant its Termux command permission."

termux-open --view --content-type application/vnd.android.package-archive "$apk_path"
