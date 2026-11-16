"""Snapshot freshness regressions; uses no ADB or Android device."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("native_capture", Path(__file__).with_name("capture-open-letter.py"))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class SnapshotTests(unittest.TestCase):
    def runner(self, dump_outputs, documents):
        runner = object.__new__(capture.NativeCapture)
        calls = []
        outputs = iter(dump_outputs)
        docs = iter(documents)

        def command(*parts, **kwargs):
            calls.append(parts)
            if parts[:3] == ("shell", "uiautomator", "dump"):
                output = next(outputs)
                return f"UI hierchary dumped to: {parts[3]}" if output == "success" else output
            if parts[:2] == ("exec-out", "cat"):
                return next(docs)
            if parts[:3] == ("shell", "rm", "-f"):
                return ""
            raise AssertionError(f"Unexpected command: {parts}")

        runner.command = command
        return runner, calls

    @patch.object(capture.time, "sleep")
    def test_idle_timeout_with_success_exit_does_not_read_an_old_dump(self, _sleep):
        runner, calls = self.runner(["ERROR: could not get idle state.", "success"], ["<hierarchy><node text='fresh'/></hierarchy>"])
        self.assertEqual(runner.tree().find("node").get("text"), "fresh")
        dumps = [c[3] for c in calls if c[:3] == ("shell", "uiautomator", "dump")]
        reads = [c[2] for c in calls if c[:2] == ("exec-out", "cat")]
        self.assertNotEqual(dumps[0], dumps[1])
        self.assertEqual(reads, [dumps[1]])
        self.assertEqual([c[3] for c in calls if c[:3] == ("shell", "rm", "-f")], dumps)

    @patch.object(capture.time, "sleep")
    def test_missing_roots_fail_closed_without_reading_or_tapping(self, _sleep):
        runner, calls = self.runner(["ERROR: null root", "", "ERROR: could not get idle state."], [])
        with self.assertRaisesRegex(capture.NativeSnapshotUnavailable, "no stale coordinates"):
            runner.tree()
        self.assertFalse(any(c[:2] == ("exec-out", "cat") for c in calls))
        self.assertEqual(len([c for c in calls if c[:3] == ("shell", "uiautomator", "dump")]), 3)

    @patch.object(capture.time, "sleep")
    def test_malformed_new_dump_is_rejected_before_next_fresh_snapshot(self, _sleep):
        runner, calls = self.runner(["success", "success"], ["<broken", "<hierarchy/>"])
        self.assertEqual(runner.tree().tag, "hierarchy")
        self.assertEqual(len([c for c in calls if c[:3] == ("shell", "rm", "-f")]), 2)


if __name__ == "__main__":
    unittest.main()
