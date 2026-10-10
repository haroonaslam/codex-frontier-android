#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CODEX_HOME_DIR="$PROJECT_ROOT/runtime/.codex"
ISOLATED_HOME="$PROJECT_ROOT/runtime/home"
MANIFEST="$PROJECT_ROOT/release-manifest.json"

cd "$PROJECT_ROOT"
./isolation-preflight.sh

test -f "$MANIFEST"
test -x "$PROJECT_ROOT/install/install.sh"
test -x "$PROJECT_ROOT/install/01-bootstrap-termux.sh"
test -x "$PROJECT_ROOT/install/02-login-codex.sh"
test -x "$PROJECT_ROOT/install/03-finish-setup.sh"

PYTHONDONTWRITEBYTECODE=1 python -m unittest \
  tests.test_android_installer \
  tests.test_android_semantic \
  tests.test_tablet_variant >/dev/null

test "$(HOME="$ISOLATED_HOME" CODEX_HOME="$CODEX_HOME_DIR" ./bin/codex --version)" = "codex-cli 0.162.1"
HOME="$ISOLATED_HOME" CODEX_HOME="$CODEX_HOME_DIR" ./bin/codex login status 2>&1 \
  | grep -Fq 'Logged in using ChatGPT'

python - "$CODEX_HOME_DIR/models_cache.json" "$MANIFEST" <<'PY'
import json
import sys

catalog = json.load(open(sys.argv[1], encoding="utf-8"))
manifest = json.load(open(sys.argv[2], encoding="utf-8"))
models = catalog.get("models", [])
ids = {
    item.get("id") or item.get("slug")
    for item in models
    if isinstance(item, dict)
}
assert "gpt-5.6-sol" in ids
assert manifest["packageId"] == "com.michaelovsky.codexsubscription.isolated"
assert manifest["codexCliVersion"] == "0.162.1"
PY

curl -fsS --connect-timeout 2 --max-time 5 \
  http://127.0.0.1:5902/codex-api/meta/methods >/dev/null

apk_asset="$(python - "$MANIFEST" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["apk"]["asset"])
PY
)"
apk_sha256="$(python - "$MANIFEST" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["apk"]["sha256"])
PY
)"
if [ -f "$PROJECT_ROOT/dist/$apk_asset" ]; then
  printf '%s  %s\n' "$apk_sha256" "$PROJECT_ROOT/dist/$apk_asset" | sha256sum -c - >/dev/null
fi

test ! -e src/com/michaelovsky/codexsubscription/isolated/BootReceiver.java
test ! -e src/com/michaelovsky/codexsubscription/isolated/RuntimeCommandResultReceiver.java
test ! -e src/com/michaelovsky/codexsubscription/isolated/RuntimeWatchdogService.java

printf 'CODEX_FRONTIER_VERIFIED\n'
