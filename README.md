# Codex Frontier for Android

Codex Frontier is an isolated, on-demand Android workspace for the native OpenAI
Codex app-server. It combines a polished mobile chat interface, exact
model/reasoning selection, live voice, plugins and skills, and independent
project/session storage without PRoot or a permanently running service.

![Codex Frontier icon](artwork/codex-frontier-icon-master.png)

## Release

- Android package: `com.michaelovsky.codexsubscription.isolated`
- Version: `2.8.0-tablet.1` (`versionCode 12`)
- Local UI: `http://127.0.0.1:5902`
- APK: `Codex-Frontier-2.8.0-tablet.1.apk` in the GitHub release
- APK SHA-256: `3d2355cd1e5551c381ebc31e4cf69f1a724fa0f7b92ba28986643f6b2b60f71f`
- Signing certificate SHA-256: `54771e961ff946d5aff525b313728eccc83aca80c19837484ef47bce76da0db2`

## Install entirely on Android

Install Termux and Termux:API from the same trusted F-Droid source, open
Termux, and run:

```sh
curl -fsSL https://raw.githubusercontent.com/haroonaslam/codex-frontier-android/main/install/install.sh | bash
```

The sequenced installer builds the private backend, guides the ChatGPT Codex
login, verifies the model catalog, downloads and checks the signed APK, and
opens Android's package installer. See [INSTALL.md](INSTALL.md) for the
inspect-before-running and resumable alternatives.

## Capabilities

- Native ChatGPT-subscription authentication through the official Codex CLI
- Live authenticated model catalog with model-specific reasoning levels
- GPT live voice with selectable voices and clean transcript writeback
- Exact model/effort frozen at Send and verified from app-server responses
- Per-thread queues and concurrent-session isolation
- Durable `/goal`, `/plan`, `/compact`, `/fork`, `/skills`, `/plugins`, `/apps`, `/mcp`, `/status`, and related controls
- Markdown, syntax-highlighted code, tables, attachments, terminals, review, projects, and automations
- On-demand native launcher and separate stop launcher
- Manual and pull-to-refresh with bounded read-only RPC retry
- Separate Android package, WebView data, HOME, CODEX_HOME, port, and sessions
- User projects in `$HOME/codex-workspace`, outside the installed application checkout
- Settings viewer/editor for global cross-project instructions, normal workspace
  instructions, and an untracked, upgrade-safe copy of the separate Frontier
  development reference

## Important installation boundary

The release APK is a real signed Android package, but it is the secure Android shell—not a bundled OpenAI account or a bundled Termux/Linux environment. Android sandboxing and OpenAI authentication prevent any legitimate APK from silently installing Termux, granting cross-app permissions, or embedding another person's ChatGPT credentials.

Accordingly, a new device needs Termux, the project runtime under the expected
Termux home path, one-time `RUN_COMMAND` permission, and the owner's own Codex
login. The Android-only installer handles the downloadable and buildable parts;
Android still asks the user to approve installation and permission prompts. No
credentials, sessions, vaults, signing keys, or device databases are included
in this repository. See [INSTALL.md](INSTALL.md).

## Source layout

- `src/`, `res/`, `AndroidManifest.xml` — native launcher, stop launcher, stable loading surface, and icon
- `install/` — resumable, Android-only backend/login/APK installation scripts
- `vendor/codexapp-frontier-src/` — modified CodexApp web/server source
- `vendor/codex-cli-frontier/` — pinned Codex CLI package metadata and provenance
- `runtime-template/` — credential-free runtime defaults
- `tests/` — isolation, lifecycle, selection, concurrency, and capability contracts
- `build-codex-frontier.sh` — deterministic raw Android build
- `isolation-preflight.sh` and `verify-codex-frontier.sh` — non-UI safety verification

## Verification performed for 2.8.0-tablet.1

- Native and header refreshes preserve the active route, thread, and composer instead of reloading the WebView.
- Startup metadata and pending-request calls have bounded read/write deadlines.
- WebSocket heartbeat, SSE fallback, and race-safe SSE cleanup recover transport failures in place.

- 34 Python/source contract tests passed
- 167 frontend unit tests passed
- Vue TypeScript and production frontend/CLI builds passed
- APK v1/v2/v3 signature verification passed
- WebSocket remained healthy across heartbeat, SSE emitted ready, and 32 concurrent RPC reads passed
- Three cold starts completed in approximately five seconds on the validated tablet
- The on-demand stop launcher terminated only the verified Frontier process group
- Protected sibling Android packages remained byte-for-byte unchanged

## Security and privacy

This repository intentionally excludes authentication snapshots, account files, runtime databases, sessions, memories, logs, vaults, the external `$HOME/codex-workspace`, Android signing keys, and local device evidence. Read [SECURITY.md](SECURITY.md) before publishing forks or diagnostic bundles.

The web interface is based on the MIT-licensed [codexui](https://github.com/friuns2/codexui) project. OpenAI Codex remains subject to OpenAI's terms and the user's own account entitlements.
