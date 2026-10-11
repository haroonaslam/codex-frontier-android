#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

APP_HOME="/data/data/com.termux/files/home/codex-subscription-isolated-app"
REPOSITORY_URL="https://github.com/haroonaslam/codex-frontier-android.git"
CODEX_VERSION="0.162.1"
CODEX_NATIVE_URL="https://registry.npmjs.org/@openai/codex/-/codex-${CODEX_VERSION}-linux-arm64.tgz"
CODEX_NATIVE_INTEGRITY="sha512-Ss7W/SrKtQFNaMtSojNoiykJgX+iDC8daM+YrcvgmJADtQPk0cd3w6Dna4CYH2CYvf9nQranj69fpcTzZ3sQIQ=="

say() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nINSTALL_FAILED: %s\n' "$1" >&2
  exit 1
}

[ "$(uname -m)" = "aarch64" ] || fail "this release currently requires a 64-bit ARM Android device"
command -v pkg >/dev/null 2>&1 || fail "run this script inside the official Termux app"

if [ "${1:-}" != "--build" ]; then
  say "Installing Termux build dependencies"
  pkg update -y
  pkg install -y nodejs curl git python clang make pkg-config

  if [ ! -e "$APP_HOME" ]; then
    say "Cloning Codex Frontier"
    git clone --branch main --single-branch "$REPOSITORY_URL" "$APP_HOME"
  elif [ ! -d "$APP_HOME/.git" ]; then
    fail "$APP_HOME exists but is not a Codex Frontier Git checkout"
  else
    say "Updating the existing Codex Frontier checkout"
    [ -z "$(git -C "$APP_HOME" status --porcelain --untracked-files=all)" ] \
      || fail "local changes exist; preserve or commit them before updating"
    git -C "$APP_HOME" fetch origin main
    if git -C "$APP_HOME" show-ref --verify --quiet refs/heads/main; then
      git -C "$APP_HOME" switch main
    else
      git -C "$APP_HOME" switch --create main --track origin/main
    fi
    git -C "$APP_HOME" merge --ff-only origin/main
    [ "$(git -C "$APP_HOME" rev-parse HEAD)" = "$(git -C "$APP_HOME" rev-parse origin/main)" ] \
      || fail "local main differs from origin/main; reconcile it before installing"
  fi

  exec "$APP_HOME/install/01-bootstrap-termux.sh" --build
fi

cd "$APP_HOME"

say "Installing and building the Frontier interface"
npm --prefix vendor/codexapp-frontier-src ci
npm --prefix vendor/codexapp-frontier-src run build

say "Installing the pinned Codex CLI"
npm --prefix vendor/codex-cli-frontier ci --omit=optional

native_archive="$(mktemp)"
native_dir="$APP_HOME/vendor/codex-cli-frontier/node_modules/@openai/codex-linux-arm64"
cleanup() {
  rm -f "$native_archive"
}
trap cleanup EXIT INT TERM

curl -fL --retry 3 --output "$native_archive" "$CODEX_NATIVE_URL"
actual_integrity="sha512-$(node -e 'const fs=require("fs"),c=require("crypto"); process.stdout.write(c.createHash("sha512").update(fs.readFileSync(process.argv[1])).digest("base64"))' "$native_archive")"
[ "$actual_integrity" = "$CODEX_NATIVE_INTEGRITY" ] || fail "Codex ARM64 package integrity check failed"

rm -rf "$native_dir"
mkdir -p "$native_dir"
tar -xzf "$native_archive" -C "$native_dir" --strip-components=1

chmod 755 \
  bin/codex \
  bin/codex-uninstall \
  bin/codex_runtime.py \
  bin/termux-connect-proxy.mjs \
  build-codex-frontier.sh \
  codex-frontier-runtime.sh \
  codex-frontier-start.sh \
  codex-frontier-stop.sh \
  install/01-bootstrap-termux.sh \
  install/02-login-codex.sh \
  install/03-finish-setup.sh \
  install/install.sh \
  isolation-preflight.sh \
  verify-codex-frontier.sh

mkdir -p runtime/.codex runtime/home workspace "$HOME/.termux"
if [ ! -f runtime/.codex/config.toml ]; then
  cp runtime-template/.codex/config.toml runtime/.codex/config.toml
fi
chmod 600 runtime/.codex/config.toml

properties="$HOME/.termux/termux.properties"
touch "$properties"
if ! grep -qxF 'allow-external-apps = true' "$properties"; then
  printf '\nallow-external-apps = true\n' >> "$properties"
fi

actual_version="$(HOME="$APP_HOME/runtime/home" CODEX_HOME="$APP_HOME/runtime/.codex" ./bin/codex --version)"
[ "$actual_version" = "codex-cli $CODEX_VERSION" ] || fail "unexpected Codex version: $actual_version"

say "Backend installation complete"
printf '%s\n' \
  "Next, run:" \
  "  cd $APP_HOME" \
  "  ./install/02-login-codex.sh"
