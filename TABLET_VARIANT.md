# Codex Frontier Tablet Variant

This local variant is intentionally on-demand and minimal:

- Native Termux runtime; no PRoot or OpenClaw.
- Loopback-only server on `127.0.0.1:5902`.
- No boot receiver, wake lock, sticky watchdog, foreground service, or completion polling.
- A separate **Stop Codex Frontier** launcher stops only the verified Frontier process group.
- Project-local OpenAI Codex CLI `0.162.1` using an independent ChatGPT subscription login.
- A loopback-only CONNECT bridge on `127.0.0.1:5903` supplies Android DNS to the
  official Linux ARM64 Codex binary. It starts and stops in the same verified
  process group as the UI runtime and permits only HTTPS destination port 443.
- A Termux-native `bin/codex` wrapper avoids the Linux `/usr/bin/env` shebang
  incompatibility in background `RUN_COMMAND` sessions.
- `workspace-write` sandboxing with `on-request` approvals.
- A normal user workspace at `$HOME/codex-workspace`, outside the application
  checkout, with consumer-focused `AGENTS.md` guidance.
- A settings viewer/editor that exposes global cross-project instructions, the
  active workspace instructions, and the separate opt-in development reference.
- Directly copied local skills under `runtime/.codex/skills`.

Termux must have `allow-external-apps = true` in
`~/.termux/termux.properties`, followed by a full Termux app restart. The
Android app holds the separate `com.termux.permission.RUN_COMMAND` grant.

For temporary maintenance access, `ssh-on` enables only the marked setup key
and starts `sshd`; `ssh-off` comments that key and stops `sshd`. The disabled
key remains recoverable for future updates.

Validated on the tablet with three cold starts at approximately five seconds,
the WebSocket/SSE transport probe, 32 concurrent RPC reads, seven subscription
models, `gpt-5.6-sol` as the default, and a live `gpt-5.6-sol` response.

The web dependency audit retains four high-severity advisories inherited
through Firebase/Firestore's `@grpc/grpc-js`. npm offers only a forced breaking
Firebase downgrade. The local Codex path does not expose a gRPC server, and all
runtime listeners are loopback-only.

The locally generated Android signing keystore must be retained for future APK updates. It is excluded from Git and must never be published.
