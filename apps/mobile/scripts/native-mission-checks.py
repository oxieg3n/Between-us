"""Real Android responsive, font-scale, keyboard and navigation checks.

The master runs this serially after installing the tested APK and serving Metro.
Screenshots are original ADB captures. WM/density/font overrides are restored in
finally, including failure paths. --self-test never invokes ADB.
"""

import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import time


SPEC = importlib.util.spec_from_file_location("between_us_mission_capture", Path(__file__).with_name("capture-mission.py"))
LIB = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LIB)


def rectangle(node):
    values = list(map(int, re.findall(r"-?\d+", node.get("bounds", ""))))
    if len(values) != 4:
        raise AssertionError("Control has no valid native rectangle.")
    return values


def visible_ime_top(windows):
    values = re.findall(r"type=ime\s+frame=\[-?\d+,(-?\d+)\]\[-?\d+,-?\d+\][^\n]*visible=true", windows)
    if not values:
        raise AssertionError("No visible software keyboard frame; avoidance has not been proven.")
    return min(map(int, values))


def override_value(kind, previous):
    match = re.search(r"Override (?:size|density):\s*(\S+)", previous)
    return match.group(1) if match else "reset"


class NativeChecks(LIB.MissionCapture):
    def __init__(self, args):
        super().__init__(args)
        self.results = []
        self.before = {}

    def result(self, case, **values):
        self.results.append({"case": case, **values})
        (self.root / "native-check-results.json").write_text(json.dumps({
            "build_id": LIB.BUILD_ID, "source_head": self.metadata.get("source_head_at_capture"),
            "results": self.results, "original_device_overrides": self.before,
        }, indent=2), encoding="utf-8")

    def read_size(self):
        sizes = re.findall(r"(\d+)x(\d+)", self.command("shell", "wm", "size"))
        self.width, self.height = map(int, sizes[-1])

    def settle(self):
        for _ in range(10):
            try:
                self.tree()
                return
            except Exception:
                time.sleep(0.5)
        raise RuntimeError("Native accessibility tree did not settle after device override.")

    def restore_geometry(self):
        self.command("shell", "wm", "size", override_value("size", self.before["size"]))
        self.command("shell", "wm", "density", override_value("density", self.before["density"]))
        self.read_size()
        self.settle()

    def restore_font(self):
        if self.before["font_scale"] == "null":
            self.command("shell", "settings", "delete", "system", "font_scale")
        else:
            self.command("shell", "settings", "put", "system", "font_scale", self.before["font_scale"])

    def complete_bounds(self, node, label, top_limit=None):
        left, top, right, bottom = rectangle(node)
        limit = self.height if top_limit is None else top_limit
        if left < 0 or top < 0 or right > self.width or bottom > limit or right <= left or bottom <= top:
            raise AssertionError(f"{label} is clipped/covered: {[left, top, right, bottom]}, viewport {self.width}x{limit}")
        return [left, top, right, bottom]

    def navigation(self):
        positions = {}
        for label in ("Home", "Journal", "Chats", "Circle"):
            node = self.find(label, clickable=True)
            if node is None:
                raise AssertionError(f"Visible native navigation control missing: {label}")
            positions[label] = self.complete_bounds(node, label)
        return positions

    def responsive(self, theme):
        cases = [("small", 840, 1680, 420), ("standard", 1080, 2424, 420),
                 ("large", 1260, 2730, 420), ("tablet", 1920, 2560, 320)]
        for name, width, height, density in cases:
            self.command("shell", "wm", "size", f"{width}x{height}")
            self.command("shell", "wm", "density", density)
            self.read_size()
            self.settle()
            self.home()
            nav = self.navigation()
            self.capture(theme, f"{name}-home", "Actual single-AVD viewport override; four native navigation destinations remain visible.")
            self.finance("Savings goals")
            self.require("Open goal: A new video game")
            self.top()
            self.capture(theme, f"{name}-goals", "Actual savings overview at this viewport size; fictional memory-only fixtures.")
            self.tap("Open goal: A new video game")
            self.require("All savings goals")
            self.top()
            self.capture(theme, f"{name}-goal-detail", "Actual nested goal detail before testing the Android Back action.")
            self.command("shell", "input", "keyevent", "4")
            self.require("Open goal: A new video game")
            if self.find("All savings goals", clickable=True) is not None:
                raise AssertionError("Android Back did not leave the selected goal detail.")
            self.capture(theme, f"{name}-goal-after-back", "Actual Android Back returned from goal detail to the goal overview.")
            self.result(f"{theme} {name} responsive", result="passed", pixels=[width, height], density=density,
                        dp=[round(width * 160 / density), round(height * 160 / density)],
                        navigation=nav, goal_back="native Back returned to goal overview",
                        limitation="Viewport overrides on one Pixel_10 AVD, not separate physical hardware.")
        self.restore_geometry()

    def font_scale(self, theme):
        self.command("shell", "settings", "put", "system", "font_scale", "2.0")
        self.settle()
        self.home()
        nav = self.navigation()
        self.capture(theme, "font-200-home", "Actual 200% Android font scale; navigation remains reachable without clipping.")
        self.finance("Savings goals")
        self.tap("Open goal: A new video game")
        self.require("All savings goals")
        self.capture(theme, "font-200-goal", "Actual goal writing/planning controls at 200% system font scale.")
        self.command("shell", "input", "keyevent", "4")
        self.require("Open goal: A new video game")
        self.role("parent")
        self.finance("Savings matching")
        self.tap("Review matching settings")
        self.require("Save prospective matching rule?")
        self.capture(theme, "font-200-confirmation-top", "Actual long confirmation dialog at 200% font; content remains scrollable.")
        confirm = self.locate("Confirm", clickable=True)
        confirm_bounds = self.complete_bounds(confirm, "Confirm")
        self.capture(theme, "font-200-confirmation-action", "Scrolled native modal makes the full Confirm action reachable at 200% font scale.")
        cancel = self.locate("Cancel", clickable=True)
        cancel_bounds = self.complete_bounds(cancel, "Cancel")
        self.capture(theme, "font-200-confirmation-cancel", "Scrolled native modal makes Cancel fully reachable; no financial rule is changed.")
        self.tap("Cancel", scroll=False)
        self.result(f"{theme} font scale 200%", result="passed", navigation=nav,
                    confirm_bounds=confirm_bounds, cancel_bounds=cancel_bounds,
                    interaction="Scrolled confirmation and cancelled without saving settings.")
        self.command("shell", "settings", "put", "system", "font_scale", "1.0")
        self.settle()
        self.role("child")

    def keyboard_and_review(self, theme):
        self.home()
        self.tap("Journal", scroll=False)
        self.tap("New entry")
        title = f"Fictional {theme} keyboard page"
        body = f"Fictional {theme} journal writing remains mine while I visit the other tabs."
        self.field("Entry title", title, dismiss_keyboard=False)
        self.field("Your private demo words", body, dismiss_keyboard=False)
        editor_ime_top = visible_ime_top(self.command("shell", "dumpsys", "window"))
        self.capture(theme, "journal-keyboard", "Actual fictional typing in the journal editor with the native software keyboard open.")
        self.hide_keyboard()
        self.tap("Save entry")
        self.require("Saved in this session")
        self.tap("Journal", scroll=False)
        self.tap(f"Revisit {title}")
        if self.locate_field("Your private demo words").get("text") != body:
            raise AssertionError("Journal writing changed after Save/revisit.")
        self.result(f"{theme} journal editing", result="passed", visible_ime_top=editor_ime_top,
                    interaction="Typed title/body through native EditText, saved and revisited identical fictional text.")

        self.tap("Chats", scroll=False)
        self.tap("Open conversation with Alex.", prefix=True)
        message = f"Fictional {theme} native keyboard conversation."
        self.field("Message draft", message, dismiss_keyboard=False)
        windows = self.command("shell", "dumpsys", "window")
        ime_top = visible_ime_top(windows)
        draft = self.locate_field("Message draft")
        review = self.find("Review", clickable=True)
        if review is None:
            raise AssertionError("Review is not visible while the native keyboard is open.")
        positions = {"Message draft": self.complete_bounds(draft, "Message draft", ime_top),
                     "Review": self.complete_bounds(review, "Review", ime_top)}
        self.capture(theme, "conversation-keyboard", "Actual visible native IME; full input and Review bounds verified above its top edge.")
        # Crucially do not dismiss IME before this real Review tap.
        self.tap("Review", scroll=False)
        self.require("Review your words")
        self.hide_keyboard()
        self.capture(theme, "native-message-review", "Actual Review action succeeded while the native keyboard was open.")
        self.tap("Edit my words")
        self.field("Your message", message + " Edited before review.")
        self.tap("Review my words")
        self.require(message + " Edited before review.")
        self.capture(theme, "native-edited-message-review", "Actual edited draft is shown verbatim on Review before simulated Send.")
        self.tap("Simulate send")
        self.require("Simulated message only.", prefix=True)
        self.require(message + " Edited before review.")
        self.capture(theme, "native-simulated-conversation", "Actual reviewed fictional message was simulated; nothing was delivered.")
        self.command("shell", "input", "keyevent", "4")
        self.require("Review your words")
        self.result(f"{theme} keyboard and review", result="passed", visible_ime_top=ime_top, control_bounds=positions,
                    interaction="Review tapped with IME open; edited, reviewed, simulated, and Android Back returned to Review.")

    def appearance_persistence(self, theme):
        expected = "Night Harbor · Selected" if theme == "dark" else "Safe Harbor · Selected"
        self.settings()
        self.require(expected)
        self.launch_app()
        self.verify_build()
        self.require(expected)
        self.capture(theme, "appearance-after-restart", "Actual stored appearance selection survived a full native process restart.")
        self.result("native appearance persistence", result="passed", selection=expected,
                    interaction="Verified selected appearance before and after force-stop/relaunch without setting it again.")
        self.tap("Follow device appearance")
        self.require("Changes with your device · Selected")
        self.capture("system", "appearance-follow-device", "Returned the demo to its approved Follow Device default through actual settings; actual colors follow the device.")
        self.home()

    def run(self):
        branch = LIB.git("branch", "--show-current")
        if branch != "feature/mobile-foundation":
            raise RuntimeError(f"Unexpected branch: {branch}")
        if "device" not in self.command("get-state"):
            raise RuntimeError("Selected Android device unavailable.")
        self.before = {"size": self.command("shell", "wm", "size"),
                       "density": self.command("shell", "wm", "density"),
                       "font_scale": self.command("shell", "settings", "get", "system", "font_scale")}
        self.read_size()
        self.metadata = {"source_head_at_capture": LIB.git("rev-parse", "HEAD"), "branch": branch,
                         "app_package": self.args.app_package, "metro_port": self.args.port,
                         "android": self.command("shell", "getprop", "ro.build.version.release"),
                         "emulator": self.command("emu", "avd", "name").splitlines()[0],
                         "serial": self.serial, "original_resolution": [self.width, self.height]}
        completed = False
        run_error = None
        try:
            for theme in (["light", "dark"] if self.args.theme == "both" else [self.args.theme]):
                self.restore_geometry()
                self.command("shell", "settings", "put", "system", "font_scale", "1.0")
                self.fresh_theme(theme)
                if self.args.section in ("all", "responsive"):
                    self.responsive(theme)
                    self.font_scale(theme)
                if self.args.section in ("all", "interaction"):
                    self.keyboard_and_review(theme)
            self.appearance_persistence(theme)
            completed = True
        except Exception as error:
            run_error = f"{type(error).__name__}: {error}"
            self.result("failure", result="failed", error=run_error)
            self.write_manifest(error=run_error)
            raise
        finally:
            restored = []
            restore_errors = []
            for label, restore in (("size/density", self.restore_geometry), ("font_scale", self.restore_font)):
                try:
                    restore()
                    restored.append(label)
                except Exception as error:
                    restore_errors.append(f"{label}: {type(error).__name__}: {error}")
            try:
                after = {"size": self.command("shell", "wm", "size"),
                         "density": self.command("shell", "wm", "density"),
                         "font_scale": self.command("shell", "settings", "get", "system", "font_scale")}
                if after != self.before:
                    restore_errors.append(f"Restoration mismatch: before={self.before}; after={after}")
            except Exception as error:
                restore_errors.append(f"Restoration verification: {type(error).__name__}: {error}")
            self.result("device restoration", result="failed" if restore_errors else "verified restored",
                        properties=restored, errors=restore_errors)
            self.write_manifest(completed=completed and not restore_errors,
                                error="; ".join(restore_errors) if restore_errors else run_error)
            if restore_errors:
                raise RuntimeError("Device restoration requires attention: " + "; ".join(restore_errors))
        self.note(f"Native mission checks passed. Evidence: {self.root}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", type=Path, default=Path(os.environ["LOCALAPPDATA"]) / "Android/Sdk/platform-tools/adb.exe")
    parser.add_argument("--serial", default="emulator-5554")
    parser.add_argument("--app-package", default="com.oxieg3n.betweenus")
    parser.add_argument("--port", type=int, default=8082)
    parser.add_argument("--theme", choices=("light", "dark", "both"), default="both")
    parser.add_argument("--section", choices=("all", "responsive", "interaction"), default="all")
    parser.add_argument("--run-id")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+", args.app_package):
        parser.error("Use a valid Metro port and dotted Android package name.")
    if args.self_test:
        assert LIB.safe_input("Fictional journal") == "Fictional%sjournal"
        assert visible_ime_top("type=ime frame=[0,1541][1080,2424] visible=true") == 1541
        try:
            visible_ime_top("type=ime frame=[0,1541][1080,2424] visible=false")
        except AssertionError:
            pass
        else:
            raise AssertionError("A hidden keyboard was accepted as proof.")
        assert override_value("size", "Physical size: 1080x2424") == "reset"
        assert override_value("density", "Physical density: 420\nOverride density: 320") == "320"
        print("PASS: input, visible IME and restoration parsing; no ADB invocation.")
        return
    args.run_id = args.run_id or f"{LIB.BUILD_ID}-native-checks-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    NativeChecks(args).run()


if __name__ == "__main__":
    main()
