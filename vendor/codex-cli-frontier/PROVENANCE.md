# Frontier Codex CLI provenance

- Wrapper package: `@openai/codex@0.162.1`
- Native package: `@openai/codex@0.162.1-linux-arm64`
- Installed directly from the npm registry into this project-local runtime.
- Verify the resolved package and executable before every deployment.

The native package is vendored explicitly because npm reports Termux as Android and therefore omits/refuses the package's Linux OS constraint, even though the published musl ARM64 binary is the correct executable for this environment. This install is project-local and does not alter the shared/global Codex CLI.
