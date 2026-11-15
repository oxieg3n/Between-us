"""Capture Open Letter screens from the actual Android app through ADB UI actions.

Run only after the master freezes the tested source and opens it in Expo Go.
Only appearance preferences are changed; example journal/message content is unedited.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import time
import xml.etree.ElementTree as ET


PROJECT = Path(__file__).resolve().parents[3]
CAPTURES = PROJECT / "spec" / "qa" / "open-letter"
BUILD_ID = re.search(r'BUILD_ID\s*=\s*"([^"]+)"', (PROJECT / "apps/mobile/src/build.ts").read_text(encoding="utf-8")).group(1)
SCREEN_NAMES = (
    "child-home", "parent-home", "journal-overview", "journal-editor",
    "journal-reflection", "conversations", "active-conversation", "my-circle",
    "parent-contacts", "checkin-scheduler", "child-checkin", "appearance-settings",
)


class NativeCapture:
    def __init__(self, args):
        self.args = args
        self.adb = str(args.adb)
        self.serial = args.serial
        self.width = 1080
        self.height = 2424
        self.records = []
        self.log = []

    def command(self, *parts, binary=False, timeout=60):
        result = subprocess.run(
            [self.adb, "-s", self.serial, *map(str, parts)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout,
            check=True,
        )
        return result.stdout if binary else result.stdout.decode("utf-8", "replace").strip()

    def note(self, message):
        print(message, flush=True)
        self.log.append({"time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "message": message})
        CAPTURES.mkdir(parents=True, exist_ok=True)
        (CAPTURES / "capture-actions.json").write_text(json.dumps(self.log, indent=2), encoding="utf-8")

    def tree(self):
        self.command("shell", "uiautomator", "dump", "/sdcard/between-us-open-letter.xml")
        raw = self.command("exec-out", "cat", "/sdcard/between-us-open-letter.xml")
        return ET.fromstring(raw[raw.find("<?xml"):] if "<?xml" in raw else raw)

    def matches(self, node, label, prefix=False):
        values = (node.get("content-desc", ""), node.get("text", ""))
        return any(value.startswith(label) if prefix else value == label for value in values)

    def bounds(self, node):
        values = list(map(int, re.findall(r"-?\d+", node.get("bounds", ""))))
        if len(values) != 4:
            return None
        left, top, right, bottom = values
        if right <= left or bottom <= top:
            return None
        x, y = (left + right) // 2, (top + bottom) // 2
        if not (0 <= x < self.width and 0 <= y < self.height):
            return None
        return x, y

    def find(self, label, prefix=False, clickable=False):
        for node in self.tree().iter("node"):
            if self.matches(node, label, prefix) and self.bounds(node):
                if not clickable or node.get("clickable") == "true":
                    return node
        return None

    def swipe(self, direction):
        x = self.width // 2
        high, low = int(self.height * 0.28), int(self.height * 0.77)
        start, end = (low, high) if direction == "down" else (high, low)
        self.command("shell", "input", "swipe", x, start, x, end, 300)
        time.sleep(0.15)

    def top(self):
        for _ in range(2):
            self.swipe("up")

    def locate(self, label, prefix=False, clickable=False, scroll=True):
        node = self.find(label, prefix, clickable)
        if node is not None:
            return node
        if scroll:
            for direction in ("down", "up"):
                for _ in range(5):
                    self.swipe(direction)
                    node = self.find(label, prefix, clickable)
                    if node is not None:
                        return node
        raise RuntimeError(f"Native control/text not found: {label}")

    def tap(self, label, prefix=False, scroll=True):
        node = self.locate(label, prefix, clickable=True, scroll=scroll)
        x, y = self.bounds(node)
        self.command("shell", "input", "tap", x, y)
        time.sleep(0.2)
        self.note(f"Tapped: {label}")

    def require(self, label, prefix=False, scroll=True):
        return self.locate(label, prefix, scroll=scroll)

    def home(self):
        self.tap("Home", scroll=False)
        self.require("Some things are", prefix=True)
        self.top()

    def settings(self):
        self.tap("Profile & settings", scroll=False)
        self.require("Make yourself at home.")
        self.top()

    def role(self, role):
        self.settings()
        self.tap(f"Switch to {role} demo")
        self.require(f"Hi, {'Sam' if role == 'child' else 'Alex'}.")
        self.top()

    def capture(self, theme, name, description):
        target = CAPTURES / theme / f"{name}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and not self.args.replace:
            raise FileExistsError(f"Refusing to overwrite {target}; use --replace for an authorized recapture.")
        self.command("shell", "screencap", "-p", "/sdcard/between-us-open-letter.png")
        self.command("pull", "/sdcard/between-us-open-letter.png", target)
        raw = target.read_bytes()
        if raw[:8] != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"ADB did not return a PNG: {target}")
        width, height = struct.unpack(">II", raw[16:24])
        if (width, height) != (self.width, self.height):
            raise RuntimeError(f"Unexpected screenshot resolution: {width} x {height}")
        self.records.append({
            "file": str(target.relative_to(CAPTURES)).replace("\\", "/"),
            "theme": theme, "description": description,
            "width": width, "height": height,
            "sha256": hashlib.sha256(raw).hexdigest(),
        })
        self.note(f"Captured {theme}/{name}.png ({width} x {height})")

    def verify_build(self):
        self.settings()
        self.require(f"Build {BUILD_ID}")
        self.note(f"Verified native Settings build: {BUILD_ID}")
        self.top()

    def wait_ready(self):
        for attempt in range(45):
            try:
                root = self.tree()
                if any(self.matches(node, "Profile & settings") for node in root.iter("node")):
                    return
                if any(node.get("text", "").startswith("SDK version:") for node in root.iter("node")):
                    close = next((node for node in root.iter("node") if node.get("content-desc") == "Close" and self.bounds(node)), None)
                    if close is not None:
                        x, y = self.bounds(close)
                        self.command("shell", "input", "tap", x, y)
                        self.note("Closed Expo Go's native development menu before capture.")
            except (ET.ParseError, subprocess.CalledProcessError):
                pass
            if attempt % 10 == 0:
                self.note("Waiting for the native application to finish loading its tested bundle…")
            time.sleep(2)
        raise RuntimeError("Between Us did not reach its native header within the startup wait.")

    def capture_theme(self, theme):
        self.settings()
        self.tap("Light mode" if theme == "light" else "Dark mode")
        self.require("Safe Harbor" if theme == "light" else "Night Harbor", prefix=True)
        self.top()
        self.capture(theme, "appearance-settings", "Appearance selected through the app's actual settings.")
        # Each theme starts and ends as the child, so role changes remain predictable.
        self.home()
        self.require("Hi, Sam.")
        self.capture(theme, "child-home", "Child home, saved example content, no input changes.")

        self.tap("Journal", scroll=False)
        self.require("A SPACE OF YOUR OWN")
        self.top()
        self.capture(theme, "journal-overview", "Child journal overview; only the child fixture is listed.")
        self.tap("Revisit A little space to think")
        self.require("ENTRY TITLE")
        self.top()
        self.capture(theme, "journal-editor", "Saved child journal in the real writing editor; keyboard dismissed.")
        self.tap("Help me find someone to talk to")
        self.require("You choose the person.")
        # Bring the optional suggestion and its actions into the viewport without editing it.
        self.swipe("down")
        self.require("You choose the person.")
        self.capture(theme, "journal-reflection", "Opt-in local conversation suggestion after a saved entry.")

        self.tap("Chats", scroll=False)
        self.require("A little closer")
        self.top()
        self.capture(theme, "conversations", "Modern conversation list containing the fictional Alex thread.")
        self.tap("Open conversation with Alex.", prefix=True)
        self.require("Demo thread", prefix=True)
        self.top()
        self.capture(theme, "active-conversation", "Actual incoming/outgoing seed thread with keyboard-aware composer.")

        self.tap("Circle", scroll=False)
        self.require("PEOPLE YOU CHOOSE")
        self.top()
        self.capture(theme, "my-circle", "Child's trusted contact list and fixed bottom navigation.")

        self.role("parent")
        self.capture(theme, "parent-home", "Parent home, identical family fixtures and theme.")
        self.tap("Circle", scroll=False)
        self.tap("Open Teacher Lee,", prefix=True)
        self.require("PARENT CONTACT MANAGEMENT")
        self.top()
        self.capture(theme, "parent-contacts", "Parent contact management for fictional invited teacher; no changes made.")
        self.home()
        self.tap("Schedule a check-in")
        self.require("A question,", prefix=True)
        self.top()
        self.capture(theme, "checkin-scheduler", "Parent example scheduler, recipient, days and time; no real notifications.")
        self.require("Save example schedule")
        self.capture(theme, "checkin-scheduler-preview", "Additional lower scheduler view showing preview and Save action.")

        self.role("child")
        self.tap("Open check-in")
        self.require("An open door.", prefix=True)
        self.top()
        self.capture(theme, "child-checkin", "Child optional check-in controls; no answer, skip or schedule changed.")

    def capture_supplement(self, theme):
        self.settings()
        self.tap("Light mode" if theme == "light" else "Dark mode")
        self.require(f"Build {BUILD_ID}")
        self.capture(theme, "build-identifier", "Native Settings footer showing the tested build identifier.")
        self.home()
        self.tap("Open check-in")
        self.require("Skip this check-in")
        self.capture(theme, "child-checkin-actions", "Additional full viewport showing optional later/skip controls without activating them.")
        self.role("parent")
        self.tap("Circle", scroll=False)
        self.tap("Open Teacher Lee,", prefix=True)
        self.require("Remove Teacher Lee")
        self.capture(theme, "parent-contact-actions", "Parent block/report/remove controls in the real lower management viewport.")
        self.tap("Remove Teacher Lee")
        self.require("Remove this trusted person?")
        self.capture(theme, "contact-removal-confirmation", "Actual parent removal confirmation dialog; Cancel is used immediately after capture.")
        self.tap("Cancel", scroll=False)
        self.home()
        self.tap("Schedule a check-in")
        self.require("Save example schedule")
        self.swipe("down")
        self.require("Save example schedule")
        self.capture(theme, "checkin-scheduler-save", "Additional lower scheduler viewport with the complete Save label/control visible; no schedule is saved.")
        self.role("child")

    def run(self):
        branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=PROJECT, text=True).strip()
        if branch != "feature/mobile-foundation":
            raise RuntimeError(f"Unexpected branch: {branch}")
        if "device" not in self.command("get-state"):
            raise RuntimeError("The selected emulator is not ready.")
        size = self.command("shell", "wm", "size")
        matches = re.findall(r"(\d+)x(\d+)", size)
        self.width, self.height = map(int, matches[-1])
        android = self.command("shell", "getprop", "ro.build.version.release")
        model = self.command("shell", "getprop", "ro.product.model")
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=PROJECT, text=True).strip()
        dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=PROJECT, text=True).strip())
        self.note(f"Native capture: {branch}; {BUILD_ID}; source HEAD {sha}; dirty={dirty}; Android {android}; {self.width}x{self.height}")
        self.wait_ready()
        if self.find("Explore as Sam", clickable=True) is not None:
            self.tap("Explore as Sam")
        self.verify_build()
        # The initial inspection determines the actual role, without changing private state directly.
        self.home()
        if self.find("Hi, Alex.") is not None:
            self.role("child")
        for theme in (["light", "dark"] if self.args.theme == "both" else [self.args.theme]):
            if self.args.supplement:
                self.capture_supplement(theme)
            else:
                self.capture_theme(theme)
        manifest = {
            "build_id": BUILD_ID, "source_head_at_capture": sha, "working_tree_dirty": dirty,
            "branch": branch, "serial": self.serial, "emulator": "Pixel_10",
            "model": model, "android": android, "resolution": [self.width, self.height],
            "capture_method": "ADB shell screencap -p then adb pull; original PNG bytes",
            "screens": self.records, "actions": self.log,
        }
        CAPTURES.mkdir(parents=True, exist_ok=True)
        suffix = "-supplement" if self.args.supplement else ""
        manifest_path = CAPTURES / f"capture-manifest-{self.args.theme}{suffix}.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        self.note(f"Completed {len(self.records)} genuine native screenshots. Manifest: {manifest_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", type=Path, default=Path(os.environ["LOCALAPPDATA"]) / "Android/Sdk/platform-tools/adb.exe")
    parser.add_argument("--serial", default="emulator-5554")
    parser.add_argument("--theme", choices=("light", "dark", "both"), default="both")
    parser.add_argument("--replace", action="store_true", help="Recapture this run's files after a documented fix.")
    parser.add_argument("--supplement", action="store_true", help="Capture lower check-in actions and a canceled removal dialog after the baseline run.")
    args = parser.parse_args()
    capture = NativeCapture(args)
    try:
        capture.run()
    except Exception as error:
        capture.note(f"CAPTURE FAILED: {type(error).__name__}: {error}")
        (CAPTURES / "capture-partial.json").write_text(json.dumps({"screens": capture.records, "actions": capture.log}, indent=2), encoding="utf-8")
        raise


if __name__ == "__main__":
    main()
