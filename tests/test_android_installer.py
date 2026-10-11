import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AndroidInstallerTests(unittest.TestCase):
    def text(self, relative: str) -> str:
        return (ROOT / relative).read_text(encoding="utf-8")

    def test_master_installer_sequences_all_android_stages(self) -> None:
        script = self.text("install/install.sh")
        self.assertIn("01-bootstrap-termux.sh", script)
        self.assertIn("./install/02-login-codex.sh", script)
        self.assertIn("./install/03-finish-setup.sh", script)
        self.assertIn("BOOTSTRAP_URL=", script)
        self.assertIn('curl -fL --retry 3 --output "$temporary_script" "$BOOTSTRAP_URL"', script)
        self.assertNotIn('if [ -x "$APP_HOME/install/01-bootstrap-termux.sh" ]', script)
        self.assertNotIn("adb ", script)
        self.assertNotIn("powershell", script.lower())

    def test_bootstrap_pins_and_verifies_codex_arm64(self) -> None:
        script = self.text("install/01-bootstrap-termux.sh")
        self.assertIn('APP_HOME="/data/data/com.termux/files/home/codex-subscription-isolated-app"', script)
        self.assertIn('CODEX_VERSION="0.162.1"', script)
        self.assertIn("CODEX_NATIVE_INTEGRITY=", script)
        self.assertIn("npm --prefix vendor/codexapp-frontier-src run build", script)
        self.assertIn("status --porcelain --untracked-files=all", script)
        self.assertIn("config --add remote.origin.fetch", script)
        self.assertIn("fetch origin main:refs/remotes/origin/main", script)
        self.assertIn("switch main", script)
        self.assertIn("merge --ff-only origin/main", script)
        self.assertIn("rev-parse origin/main", script)

    def test_apk_builder_requires_clean_pushed_main(self) -> None:
        script = self.text("build-tablet-apk.ps1")
        self.assertIn("branch --show-current", script)
        self.assertIn("$branch -ne 'main'", script)
        self.assertIn("status --porcelain --untracked-files=all", script)
        self.assertIn("fetch origin 'main:refs/remotes/origin/main'", script)
        self.assertIn("rev-parse origin/main", script)

    def test_login_is_isolated_and_hydrates_catalog(self) -> None:
        script = self.text("install/02-login-codex.sh")
        self.assertIn('export HOME="$ISOLATED_HOME"', script)
        self.assertIn('export CODEX_HOME="$CODEX_HOME_DIR"', script)
        self.assertIn("login --device-auth", script)
        self.assertIn("hydrate-model-cache.mjs", script)
        self.assertIn("./isolation-preflight.sh", script)

    def test_workspace_migration_preserves_existing_sessions_and_updates(self) -> None:
        bootstrap = self.text("install/01-bootstrap-termux.sh")
        setup = self.text("install/ensure-user-workspace.sh")
        self.assertIn("install/ensure-user-workspace.sh", bootstrap)
        self.assertIn('mv "$LEGACY_WORKSPACE" "$USER_WORKSPACE"', setup)
        self.assertIn('ln -s "$USER_WORKSPACE" "$LEGACY_WORKSPACE"', setup)
        self.assertIn('if [ ! -e "$USER_WORKSPACE/AGENTS.md" ]', setup)
        self.assertIn('GLOBAL_INSTRUCTIONS="$APP_HOME/runtime/.codex/skills/AGENTS.md"', setup)
        self.assertIn('if [ -s "$GLOBAL_INSTRUCTIONS_LINK" ] && [ ! -L "$GLOBAL_INSTRUCTIONS_LINK" ]', setup)
        self.assertIn('if [ ! -s "$GLOBAL_INSTRUCTIONS" ]', setup)
        self.assertIn('ln -s "skills/AGENTS.md" "$GLOBAL_INSTRUCTIONS_LINK"', setup)
        self.assertIn('if [ ! -e "$EDITABLE_DEVELOPMENT" ]', setup)
        self.assertIn("personal notes never make", setup)

    def test_finish_downloads_verifies_and_opens_apk_on_android(self) -> None:
        script = self.text("install/03-finish-setup.sh")
        self.assertIn("release-manifest.json", script)
        self.assertIn("tests.test_android_installer", script)
        self.assertIn("sha256sum", script)
        self.assertIn("termux-open --view", script)
        self.assertNotIn("adb ", script)
        self.assertNotIn("powershell", script.lower())

    def test_release_manifest_matches_local_apk_when_present(self) -> None:
        manifest = json.loads(self.text("release-manifest.json"))
        self.assertEqual(manifest["packageId"], "com.michaelovsky.codexsubscription.isolated")
        self.assertEqual(manifest["versionName"], "2.8.0-tablet.1")
        self.assertEqual(manifest["codexCliVersion"], "0.162.1")
        apk = ROOT / "dist" / manifest["apk"]["asset"]
        if apk.is_file():
            digest = hashlib.sha256(apk.read_bytes()).hexdigest()
            self.assertEqual(digest, manifest["apk"]["sha256"])


if __name__ == "__main__":
    unittest.main()
