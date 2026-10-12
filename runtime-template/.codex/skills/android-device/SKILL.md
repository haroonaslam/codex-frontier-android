---
name: android-device
description: Inspect and automate the local Android device through Frontier when the user asks to view the screen, open or control apps, tap, type, swipe, inspect UI elements, take screenshots, or use device functions.
---

# Android device

Use the local `codex-android` commands for Android inspection and automation. Start with semantic UI information and verified actions; use raw coordinates only when semantic targeting is unavailable.

## Safe workflow

1. Run `codex-android capabilities` when device access has not yet been verified in the current chat.
2. Use `codex-android focus` and `codex-android elements` to establish the foreground app and visible UI.
3. Prefer `tap-element`, `longtap-element`, `type-into`, and `scroll` with text, content-description, resource-id, class, or package selectors.
4. Use `codex-android screenshot` when pixels materially help; report its returned local path.
5. Verify meaningful actions using the returned foreground app, UI hierarchy, or an explicit postcondition.
6. After verification, return Codex Frontier to the foreground with `codex-android open com.michaelovsky.codexsubscription.isolated` and verify it with `codex-android wait-package com.michaelovsky.codexsubscription.isolated`.

Skip the return-to-Frontier step only when the user explicitly asks to remain in the target app, when handing the screen back to the user is part of the requested outcome, or when returning would interrupt an operation that is still running.

Useful commands include:

- `codex-android open "App name"`
- `codex-android focus`
- `codex-android elements`
- `codex-android find --text "Continue"`
- `codex-android tap-element --text "Continue"`
- `codex-android type-into --class android.widget.EditText --value "text"`
- `codex-android scroll down`
- `codex-android back|home|recents`
- `codex-android screenshot`

Do not infer success from issuing an input command alone. Never expose password-node text, authentication tokens, or credential files. Do not alter or stop Frontier, Termux, Shizuku, Android system packages, or other protected packages unless the user explicitly requests maintenance of that exact component.
