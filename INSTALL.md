# Installation

Codex Frontier has an Android-only installation path. A PC, ADB, PRoot, API key,
and desktop Codex installation are not required.

## Requirements

- A 64-bit ARM Android 11 or newer device.
- Termux and Termux:API installed from the same trusted F-Droid source.
- A ChatGPT account whose plan includes Codex.
- About 1.5 GB of free storage during installation.

The APK is the native Android shell. The installer also creates its private
Termux backend because Android does not permit an APK to silently install files
inside another app's sandbox.

## One-command Android installation

Open **Termux** and run:

```sh
curl -fsSL https://raw.githubusercontent.com/haroonaslam/codex-frontier-android/main/install/install.sh | bash
```

For users who prefer to inspect a script before running it:

```sh
curl -fLO https://raw.githubusercontent.com/haroonaslam/codex-frontier-android/main/install/install.sh
less install.sh
bash install.sh
```

The installer performs these sequenced operations:

1. Installs the required Termux packages.
2. Clones or safely fast-forwards this repository at
   `$HOME/codex-subscription-isolated-app`.
3. Builds the web interface locally in Termux.
4. Installs and verifies the pinned official Codex Linux ARM64 package.
5. Starts the ChatGPT device-code login.
6. Hydrates and validates the authenticated Codex model catalog.
7. Starts the loopback-only backend.
8. Downloads the signed release APK, verifies its SHA-256, and opens Android's
   package installer.

Android will require the user to approve installing an app from Termux. On the
first app launch, approve the separate Termux command permission. Those Android
security confirmations cannot and should not be bypassed.

If OpenAI reports that device-code login is disabled, enable it in ChatGPT
Security Settings and rerun:

```sh
cd "$HOME/codex-subscription-isolated-app"
./install/02-login-codex.sh
./install/03-finish-setup.sh
```

## Resuming individual stages

Each stage is safe to rerun:

```sh
cd "$HOME/codex-subscription-isolated-app"
./install/01-bootstrap-termux.sh
./install/02-login-codex.sh
./install/03-finish-setup.sh
```

The account credential is created only on the user's device under
`runtime/.codex`. It is excluded from Git and from the APK.

## Existing configured device

An APK-only update is sufficient when the matching Termux backend is already
installed. Download `Codex-Frontier-2.8.0-tablet.1.apk` from the GitHub Release,
open it, and approve the Android update. App data, Codex login, conversations,
the external `$HOME/codex-workspace`, and skills remain in place. On the first
upgrade from an older release, the installer moves the former in-repository
`workspace` directory to `$HOME/codex-workspace` and leaves a compatibility
link so existing conversation working directories continue to resolve.

## On-demand runtime

The main **Codex Frontier** launcher starts the backend and opens the interface.
The separate **Stop Codex Frontier** launcher stops its verified process group
and closes the Android task. There is no boot receiver, persistent watchdog,
wake lock, or always-running background service.

## Developer build

Generated UI bundles, APKs, credentials, signing keys, and device state are
intentionally excluded from Git. Building the signed APK requires Android SDK
35, Build Tools 36.1.0, JDK 21, and the original local signing keystore:

```powershell
npm --prefix vendor/codexapp-frontier-src ci
npm --prefix vendor/codexapp-frontier-src run build
./build-tablet-apk.ps1
```

Keep the keystore private and backed up. A different key cannot update an
existing installation because Android enforces signing-key continuity.
