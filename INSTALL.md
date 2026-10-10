# Installation

## Existing configured device

Download `Codex-Frontier-2.8.0.apk` from the GitHub release, verify its SHA-256 is `01ea2c4e5e31bf0090c3f4ea0d2fcf1fc23cc0430b27c374c4c6a582ebf389e2`, and install it as an update. The package signature is unchanged from earlier Frontier builds.

The update does not launch the app during installation. On the next icon tap, the native loading surface waits for the isolated runtime and reveals the UI only after a stable visual frame is ready.

## New Android device

Codex Frontier uses a Termux-hosted Node/Codex runtime. A new device therefore requires:

1. Android 6.0 or newer.
2. Termux and Termux:API from the same trusted distribution/signing source.
3. Termux packages: `nodejs`, `curl`, `git`, `python`, `clang`, `make`, and `pkg-config`. Android APK build tools are needed only when building the APK on-device.
4. This repository cloned exactly to `$HOME/codex-subscription-isolated-app`.
5. `npm ci` and `npm run build` inside `vendor/codexapp-frontier-src`.
6. `npm ci` inside `vendor/codex-cli-frontier`, plus the official `@openai/codex@0.162.1-linux-arm64` package extracted as `node_modules/@openai/codex-linux-arm64` when npm omits it on Android.
7. A one-time Codex login performed with this project's isolated `CODEX_HOME`.
8. `allow-external-apps = true` in `~/.termux/termux.properties`, followed by a full Termux app restart.
9. A one-time Android grant for `com.termux.permission.RUN_COMMAND`.
10. Installation of the locally signed tablet APK.

The user's login is created locally and is never part of the repository or APK. Android may show first-install permission or package-installer confirmation; those system security prompts cannot and should not be bypassed. This tablet variant is deliberately on-demand: it has no boot receiver or persistent watchdog.

## Build from source

The raw build expects an Android platform `android.jar` at `build-tools/android.jar` and local signing material under `build/`. Those files are intentionally excluded. Create your own keystore and `build/signing.properties`, then run:

```sh
npm --prefix vendor/codexapp-frontier-src ci
npm --prefix vendor/codexapp-frontier-src run build
./build-codex-frontier.sh
```

Changing the signing key prevents in-place updates over the official Frontier APK, which is normal Android signature enforcement.

## Runtime start

The installed package requests Termux to execute `codex-frontier-start.sh` in the background. The script:

- runs the isolation preflight;
- starts a loopback-only Android DNS/HTTPS bridge for the official Linux Codex binary;
- validates the isolated auth/config state;
- serializes startup with a lock;
- reuses a healthy port 5902 runtime;
- restarts only a PID whose exact command line, process group, and session belong to this project;
- never opens an Android activity or browser.

The **Stop Codex Frontier** launcher stops the verified process group, including
the DNS bridge, and closes the Codex Frontier Android task. Tapping the main
launcher starts a fresh on-demand session.
