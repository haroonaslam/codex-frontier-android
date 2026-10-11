import pathlib
import unittest
import xml.etree.ElementTree as ET


ROOT = pathlib.Path(__file__).resolve().parents[1]
ANDROID = "{http://schemas.android.com/apk/res/android}"


def text(path):
    return (ROOT / path).read_text(encoding="utf-8")


class TabletVariantTests(unittest.TestCase):
    def test_on_demand_manifest_has_start_and_stop_launchers_only(self):
        root = ET.fromstring(text("AndroidManifest.xml"))
        self.assertEqual(root.attrib[ANDROID + "versionCode"], "12")
        self.assertEqual(root.attrib[ANDROID + "versionName"], "2.8.0-tablet.1")
        application = root.find("application")
        names = {node.attrib[ANDROID + "name"] for node in application.findall("activity")}
        self.assertEqual(names, {".MainActivity", ".StopActivity"})
        self.assertEqual(application.findall("service"), [])
        self.assertEqual(application.findall("receiver"), [])

    def test_runtime_is_loopback_only(self):
        source = text("vendor/codexapp-frontier-src/src/cli/index.ts")
        self.assertIn("server.listen(port, '127.0.0.1')", source)
        self.assertNotIn("server.listen(port, '0.0.0.0')", source)

    def test_dns_bridge_is_loopback_and_https_only(self):
        source = text("bin/termux-connect-proxy.mjs")
        self.assertIn('const host = "127.0.0.1"', source)
        self.assertIn("destinationPort !== 443", source)
        wrapper = text("codex-frontier-runtime.sh")
        self.assertIn('HTTPS_PROXY="http://127.0.0.1:$PROXY_PORT"', wrapper)
        self.assertIn("SSL_CERT_FILE", wrapper)

    def test_codex_launcher_is_termux_native(self):
        launcher = text("bin/codex")
        self.assertTrue(launcher.startswith("#!/data/data/com.termux/files/usr/bin/bash\n"))
        self.assertIn("/data/data/com.termux/files/usr/bin/node", launcher)

    def test_stop_closes_task_and_verified_process_group(self):
        self.assertIn("finishAffinity()", text(
            "src/com/michaelovsky/codexsubscription/isolated/StopActivity.java"
        ))
        stop = text("codex-frontier-stop.sh")
        self.assertIn('kill -TERM -- "-$pid_value"', stop)
        self.assertIn('process_group', stop)
        self.assertIn('session_id', stop)

    def test_repeat_launcher_intent_restarts_runtime(self):
        main = text("src/com/michaelovsky/codexsubscription/isolated/MainActivity.java")
        self.assertIn("onNewIntent(Intent intent)", main)
        self.assertIn('startRuntimeWatchdog("launcher-intent")', main)

    def test_android_11_safe_area_insets_protect_webview(self):
        root = ET.fromstring(text("AndroidManifest.xml"))
        uses_sdk = root.find("uses-sdk")
        self.assertEqual(uses_sdk.attrib[ANDROID + "minSdkVersion"], "30")
        main = text("src/com/michaelovsky/codexsubscription/isolated/MainActivity.java")
        self.assertIn("setOnApplyWindowInsetsListener", main)
        self.assertIn("WindowInsets.Type.systemBars()", main)
        self.assertIn("WindowInsets.Type.displayCutout()", main)
        self.assertIn("rootContainer.requestApplyInsets()", main)
        self.assertIn("--min-api 30", text("build-tablet-apk.ps1"))

    def test_webview_audio_capture_has_required_android_permissions(self):
        root = ET.fromstring(text("AndroidManifest.xml"))
        permissions = {
            node.attrib[ANDROID + "name"] for node in root.findall("uses-permission")
        }
        self.assertIn("android.permission.RECORD_AUDIO", permissions)
        self.assertIn("android.permission.MODIFY_AUDIO_SETTINGS", permissions)

    def test_live_voice_reuses_primary_composer_action(self):
        composer = text(
            "vendor/codexapp-frontier-src/src/components/content/ThreadComposer.vue"
        )
        self.assertIn('v-else-if="showRealtimeVoiceAction"', composer)
        self.assertIn("isRealtimeVoiceSupported.value && !hasSubmitContent.value", composer)
        self.assertIn("IconTablerWaveSine", composer)
        self.assertNotIn("thread-composer-live-button", composer)
        self.assertIn("hasImmediateInputText.value", composer)
        self.assertIn("event?.currentTarget instanceof HTMLTextAreaElement", composer)
        self.assertIn("syncDraftFromTextarea()", composer)

    def test_first_remembered_workspace_is_selected_after_cold_start(self):
        app = text("vendor/codexapp-frontier-src/src/App.vue")
        self.assertIn("if (!selected) {", app)
        self.assertIn("newThreadCwd.value = options[0]?.value?.trim() ?? ''", app)

    def test_normal_workspace_is_outside_the_application_checkout(self):
        launcher = text("codex-frontier-start.sh")
        config = text("runtime-template/.codex/config.toml")
        setup = text("install/ensure-user-workspace.sh")
        self.assertIn('USER_WORKSPACE="$TERMUX_HOME/codex-workspace"', launcher)
        self.assertIn('CODEX_FRONTIER_WORKSPACE="$USER_WORKSPACE"', launcher)
        self.assertIn(
            '[projects."/data/data/com.termux/files/home/codex-workspace"]',
            config,
        )
        self.assertIn('USER_WORKSPACE="$TERMUX_HOME/codex-workspace"', setup)
        self.assertIn('ln -s "$USER_WORKSPACE" "$LEGACY_WORKSPACE"', setup)
        self.assertIn('EDITABLE_DEVELOPMENT="$APP_HOME/runtime/.codex/DEVELOPMENT.md"', setup)
        self.assertIn('GLOBAL_INSTRUCTIONS="$APP_HOME/runtime/.codex/skills/AGENTS.md"', setup)
        self.assertTrue((ROOT / "runtime-template/.codex/AGENTS.md").is_file())
        self.assertTrue((ROOT / "runtime-template/workspace/AGENTS.md").is_file())

    def test_consumer_guidance_is_separate_from_development_reference(self):
        agents = text("AGENTS.md")
        development = text("DEVELOPMENT.md")
        self.assertIn("Installed Runtime Guidance", agents)
        self.assertIn("unless the user explicitly asks", agents)
        self.assertNotIn("For every future change", agents)
        self.assertIn("Explicit maintenance workflow", development)
        self.assertIn("only when the user explicitly requests", development)

    def test_git_branch_control_is_not_shown_in_android_header(self):
        app = text("vendor/codexapp-frontier-src/src/App.vue")
        self.assertNotIn("<HeaderGitBranchDropdown", app)
        self.assertNotIn(
            "import HeaderGitBranchDropdown from './components/content/HeaderGitBranchDropdown.vue'",
            app,
        )

    def test_integrated_terminal_control_is_not_shown_in_android_header(self):
        app = text("vendor/codexapp-frontier-src/src/App.vue")
        self.assertNotIn('class="content-header-terminal-command"', app)
        self.assertNotIn("key === 'j'", app)

    def test_legacy_external_app_integration_is_absent(self):
        paths = (
            "AGENTS.md",
            "bin/codex-uninstall",
            "bin/codex_runtime.py",
            "isolation-preflight.sh",
            "vendor/codexapp-frontier-src/src/runtimeIdentity.ts",
            "verify-codex-frontier.sh",
        )
        combined = "\n".join(text(path).lower() for path in paths)
        legacy_package = "com.michaelovsky.codex" + "nvidia.isolated"
        legacy_root = "nvidia" + "-isolated-app"
        legacy_alias = "nvidia" + " autonomy"
        self.assertNotIn(legacy_package, combined)
        self.assertNotIn(legacy_root, combined)
        self.assertNotIn(legacy_alias, combined)

    def test_safer_codex_defaults(self):
        config = text("runtime-template/.codex/config.toml")
        self.assertIn('model = "gpt-5.6-sol"', config)
        self.assertIn('approval_policy = "on-request"', config)
        self.assertIn('sandbox_mode = "workspace-write"', config)
        self.assertIn("multi_agent = false", config)
        self.assertIn("computer_use = false", config)

    def test_temporary_ssh_access_is_reversible(self):
        on = text("tools/tablet-ssh-on.sh")
        off = text("tools/tablet-ssh-off.sh")
        self.assertIn("codex-tablet-temporary-setup", on)
        self.assertIn("codex-tablet-temporary-setup", off)
        self.assertIn("sshd", on)
        self.assertIn("pkill -x sshd", off)
        self.assertIn("# DISABLED", off)


if __name__ == "__main__":
    unittest.main()
