# Codex Frontier Development and Maintenance Contract

This document applies only when the user explicitly requests development or
maintenance of Codex Frontier itself. It does not govern ordinary projects
opened through the installed app.

## Fixed boundaries

- Application root: `/data/data/com.termux/files/home/codex-subscription-isolated-app`
- User workspace: `/data/data/com.termux/files/home/codex-workspace`
- Android package: `com.michaelovsky.codexsubscription.isolated`
- GUI port: `5902`
- Provider: native OpenAI Codex through a ChatGPT subscription session
- Default model: `gpt-5.6-sol`; the UI may select any model returned by the authenticated Codex catalog
- Protected legacy app: `com.michaelovsky.codexapplauncher`, port `5900` — never modify, reinstall, uninstall, clear, force-stop, or reconfigure it

Frontier-owned HOME, CODEX_HOME, sessions, memories, logs, plugins, skills,
models, build output, APKs, and signing material remain below the application
root. User projects remain in the separate user workspace. Shared Termux, Node,
Java, Android SDK, Shizuku, and Codex executables may be invoked as read-only
dependencies but must never be patched by this project.

The active web runtime is `vendor/codexapp-frontier-src/dist-cli/index.js`. The
active Codex executable is the project-local
`vendor/codex-cli-frontier/node_modules/.bin/codex` at version 0.162.1. Never
replace it with, update, or configure the shared global Codex installation.

The subscription credential is an independent file snapshot at
`runtime/.codex/auth.json`. It may refresh only that file. Never symlink it,
replace the original `$HOME/.codex/auth.json`, create an API key, or enable a
custom provider endpoint. Model availability is determined by the live
authenticated Codex model catalog, not an API catalog.

Skills and plugins may be imported only as validated, one-way copies. Never
share writable directories, bind-mount, symlink, mirror with deletion, or
overwrite an existing destination. Provider config, authentication, databases,
sessions, memories, vault data, logs, launchers, APKs, signing material, and app
source are never eligible for exchange.

## Explicit maintenance workflow

Only after the user has requested Frontier maintenance:

1. Run `./isolation-preflight.sh`.
2. Record the hash and HTTP health for the protected legacy app without stopping it, when that app exists.
3. Keep package ID, port, HOME, CODEX_HOME, and the external user workspace isolated.
4. Build and install only `com.michaelovsky.codexsubscription.isolated`.
5. If the Frontier runtime must be restarted, target only a PID whose full command line contains the exact application root or port 5902; never use a broad process pattern.
6. Keep `codex-frontier-start.sh` and `codex-frontier-stop.sh` headless. This variant deliberately has no boot receiver, watchdog service, wake lock, or persistent Android background service.
7. Preserve durable `/goal` RPC support and the source-level slash-command tests.
8. Run `./verify-codex-frontier.sh` without opening the Android UI.
9. Recheck the protected legacy APK hash, running process, and port when applicable.

If a required boundary cannot be proven, stop without applying or installing
the maintenance change.
