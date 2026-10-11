# Codex Frontier Installed Runtime Guidance

This checkout contains the installed Codex Frontier Android application. It is
not the user's normal project workspace. Ordinary chats and projects belong in
`/data/data/com.termux/files/home/codex-workspace`.

## Normal use

- Work on the project or files the user selected in the external workspace.
- Building, testing, starting, and stopping processes that belong to a
  user-requested project is allowed when it is part of that request.
- Do not treat Frontier's own source tree, backend, installer, or Android
  package as the target of an ordinary coding request.
- Do not read, display, copy, or expose authentication tokens, session
  credentials, signing material, or other secrets.

## Frontier maintenance

Do not modify, rebuild, verify, update, start, stop, uninstall, clear, or
reconfigure Codex Frontier itself unless the user explicitly asks to maintain
Frontier. Do not stop or alter unrelated applications or processes.

When the user explicitly requests Frontier development or maintenance, read
`DEVELOPMENT.md` before making changes. That document contains the package,
runtime, isolation, build, and verification contract; it is not an instruction
to perform those operations during normal app use.
