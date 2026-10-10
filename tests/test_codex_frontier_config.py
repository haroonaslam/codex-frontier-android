import json
import pathlib
import unittest
import xml.etree.ElementTree as ET


ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class CodexFrontierConfigTests(unittest.TestCase):
    def test_manifest_has_independent_current_identity(self) -> None:
        root = ET.parse(ROOT / "AndroidManifest.xml").getroot()
        android = "{http://schemas.android.com/apk/res/android}"
        self.assertEqual(root.attrib["package"], "com.michaelovsky.codexsubscription.isolated")
        self.assertEqual(root.attrib[android + "versionCode"], "12")
        self.assertEqual(root.attrib[android + "versionName"], "2.8.0-tablet.1")
        uses_sdk = root.find("uses-sdk")
        self.assertIsNotNone(uses_sdk)
        self.assertEqual(uses_sdk.attrib[android + "minSdkVersion"], "30")

    def test_launcher_uses_independent_root_and_loopback_port(self) -> None:
        source = read("src/com/michaelovsky/codexsubscription/isolated/RuntimeContract.java")
        self.assertIn("/codex-subscription-isolated-app", source)
        self.assertIn("/codex-frontier-start.sh", source)
        self.assertIn("/codex-frontier-stop.sh", source)
        self.assertIn("http://127.0.0.1:5902/", source)
        self.assertNotIn("http://127.0.0.1:5900/", source)

    def test_runtime_template_uses_native_subscription_defaults(self) -> None:
        config = read("runtime-template/.codex/config.toml")
        self.assertIn('model = "gpt-5.6-sol"', config)
        self.assertIn('model_reasoning_effort = "ultra"', config)
        self.assertIn('approval_policy = "on-request"', config)
        self.assertIn('sandbox_mode = "workspace-write"', config)
        self.assertNotIn("model_provider", config)
        self.assertFalse((ROOT / "runtime-template/.codex/webui-custom-providers.json").exists())

    def test_codex_cli_is_project_local_and_pinned(self) -> None:
        package = json.loads(read("vendor/codex-cli-frontier/package.json"))
        provenance = read("vendor/codex-cli-frontier/PROVENANCE.md")
        launcher = read("bin/codex")
        self.assertEqual(package["dependencies"]["@openai/codex"], "0.162.1")
        self.assertIn("0.162.1-linux-arm64", provenance)
        self.assertIn("codex-subscription-isolated-app", launcher)
        self.assertIn("/data/data/com.termux/files/usr/bin/node", launcher)

    def test_variant_is_on_demand_without_boot_watchdog(self) -> None:
        manifest = read("AndroidManifest.xml")
        self.assertNotIn("BOOT_COMPLETED", manifest)
        self.assertNotIn("RuntimeWatchdogService", manifest)
        self.assertIn("StopActivity", manifest)
        for removed in (
            "BootReceiver.java",
            "RuntimeCommandResultReceiver.java",
            "RuntimeWatchdogService.java",
        ):
            self.assertFalse(
                (ROOT / "src/com/michaelovsky/codexsubscription/isolated" / removed).exists()
            )

    def test_startup_and_stop_target_only_owned_runtime(self) -> None:
        launcher = read("codex-frontier-start.sh")
        stopper = read("codex-frontier-stop.sh")
        self.assertIn("is_owned_pid", launcher)
        self.assertIn("terminate_owned_runtime", launcher)
        self.assertIn('kill -TERM -- "-$pid_value"', launcher)
        self.assertIn("is_owned_pid", stopper)
        self.assertIn('kill -TERM -- "-$pid_value"', stopper)
        self.assertNotIn("pkill", launcher)
        self.assertNotIn("pkill", stopper)

    def test_frontend_retains_goals_skills_and_live_voice(self) -> None:
        gateway = read("vendor/codexapp-frontier-src/src/api/codexGateway.ts")
        composer = read("vendor/codexapp-frontier-src/src/components/content/ThreadComposer.vue")
        voice = read("vendor/codexapp-frontier-src/src/composables/useRealtimeVoice.ts")
        for method in ("thread/goal/get", "thread/goal/set", "thread/goal/clear"):
            self.assertIn(method, gateway)
        for command in ("/goal", "/plan", "/skills", "/plugins", "/apps", "/mcp"):
            self.assertIn(command, composer)
        self.assertIn("async function start()", voice)
        self.assertIn("appendFinalTranscript", voice)

    def test_android_safe_area_and_permission_prompts_are_native(self) -> None:
        activity = read("src/com/michaelovsky/codexsubscription/isolated/MainActivity.java")
        self.assertIn("WindowInsets.Type.systemBars()", activity)
        self.assertIn("WindowInsets.Type.displayCutout()", activity)
        self.assertIn('requestPermissions(new String[]{"com.termux.permission.RUN_COMMAND"}', activity)

    def test_release_manifest_matches_android_manifest(self) -> None:
        release = json.loads(read("release-manifest.json"))
        self.assertEqual(release["packageId"], "com.michaelovsky.codexsubscription.isolated")
        self.assertEqual(release["versionCode"], 12)
        self.assertEqual(release["versionName"], "2.8.0-tablet.1")
        self.assertEqual(len(release["apk"]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
