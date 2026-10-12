# Codex Frontier for Android

Codex Frontier is an isolated, on-demand Android workspace for the native OpenAI
Codex app-server. It combines a polished mobile chat interface, exact
model/reasoning selection, live voice, plugins and skills, and independent
project/session storage without PRoot or a permanently running service.

![Codex Frontier icon](artwork/codex-frontier-icon-master.png)

## Release

- Android package: `com.michaelovsky.codexsubscription.isolated`
- Version: `2.8.0-tablet.2` (`versionCode 13`)
- Local UI: `http://127.0.0.1:5902`
- APK: `Codex-Frontier-2.8.0-tablet.2.apk` in the GitHub release
- APK SHA-256: `1f727035bcfa32c8083e22677e97b94aa5d664e5999775afc79a3cf9734b6111`
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
- Searchable skill picker plus validated ZIP skill imports through Android's
  standard file picker
- Configurable external writable folders with protected runtime boundaries
- Ask, Automatic, and Full agent-access modes, with the safer Ask mode as the
  fresh-install default
- Shizuku-backed Android automation skill that returns to Frontier when a task
  is complete

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

## Verification performed for 2.8.0-tablet.2

- Native and header refreshes preserve the active route, thread, and composer instead of reloading the WebView.
- Startup metadata and pending-request calls have bounded read/write deadlines.
- WebSocket heartbeat, SSE fallback, and race-safe SSE cleanup recover transport failures in place.

- 46 Python/source contract tests passed
- 194 frontend unit tests passed
- Vue TypeScript and production frontend/CLI builds passed
- APK alignment, package identity, and v3 signature verification passed
- External writable roots, all three access modes, and approval-free Android
  automation were exercised on the validated phone
- Android app launching resolves only exact-package launcher components and
  returns to Frontier after a completed automation task
- Protected sibling Android packages remained byte-for-byte unchanged

## Security and privacy

This repository intentionally excludes authentication snapshots, account files, runtime databases, sessions, memories, logs, vaults, the external `$HOME/codex-workspace`, Android signing keys, and local device evidence. Read [SECURITY.md](SECURITY.md) before publishing forks or diagnostic bundles.

The web interface is based on the MIT-licensed [codexui](https://github.com/friuns2/codexui) project. OpenAI Codex remains subject to OpenAI's terms and the user's own account entitlements.
