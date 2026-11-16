"""Capture genuine Android mission workflows; run only under the master's ADB lock.

Requires the tested app served by Metro on localhost:8082 on Pixel_10.
Each theme force-stops/reopens the selected package to reset fictional fixtures. This
does not clear device/app storage. Screenshots are original ADB PNGs, never renders.
Ordinary runs create a new timestamped directory and never overwrite old evidence.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time


HELPER = Path(__file__).with_name("capture-open-letter.py")
SPEC = importlib.util.spec_from_file_location("between_us_native_capture", HELPER)
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)
PROJECT = BASE.PROJECT
BUILD_ID = BASE.BUILD_ID


def safe_input(value):
    """ADB input text only receives simple fictional ASCII, without shell syntax."""
    if not value or not re.fullmatch(r"[A-Za-z0-9 .,_-]{1,200}", value):
        raise ValueError("Only bounded fictional ASCII field values are accepted.")
    return value.replace(" ", "%s")


def edit_text_node(root, label, matches, bounds):
    """Captions can share the field label; only an editable native node is input."""
    return next((node for node in root.iter("node")
                 if node.get("class", "").endswith("EditText")
                 and matches(node, label) and bounds(node)), None)


def gutter_swipe(rect, direction):
    left, top, right, bottom = rect
    if right <= left or bottom <= top or direction not in ("up", "down"):
        raise ValueError("A valid scroll viewport and direction are required.")
    x = right - min(24, max(1, (right - left) // 8))
    high = top + (bottom - top) // 4
    low = top + (bottom - top) * 3 // 4
    return (x, low, x, high) if direction == "down" else (x, high, x, low)


def git(*parts):
    return subprocess.check_output(
        ["git", "-C", str(PROJECT), *parts], cwd=PROJECT, text=True,
    ).strip()


class MissionCapture(BASE.NativeCapture):
    def __init__(self, args):
        super().__init__(args)
        run_id = args.run_id or f"{BUILD_ID}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", run_id) or run_id in (".", ".."):
            raise ValueError("Invalid run identifier.")
        self.root = PROJECT / "spec/qa/chores-goals" / run_id
        self.journal_root = PROJECT / "spec/qa/journal-intelligence" / run_id
        for target in (self.root, self.journal_root):
            if target.exists() and not args.replace:
                raise FileExistsError(f"Preserve existing run: {target}. Choose a new run ID.")
        self.root.mkdir(parents=True, exist_ok=True)
        self.area = "finance"
        self.metadata = {}
        BASE.CAPTURES = self.root

    def swipe(self, direction):
        # Start in the scroll view's padding, outside buttons, header and navigation.
        candidates = []
        for node in self.tree().iter("node"):
            if node.get("scrollable") == "true" and node.get("class", "").endswith("ScrollView") and self.bounds(node):
                rect = list(map(int, re.findall(r"-?\d+", node.get("bounds", ""))))
                if len(rect) == 4:
                    candidates.append(rect)
        if not candidates:
            return
        rect = max(candidates, key=lambda r: (r[2] - r[0]) * (r[3] - r[1]))
        self.command("shell", "input", "swipe", *gutter_swipe(rect, direction), 350)
        time.sleep(0.3)

    def home(self):
        self.tap("Home", scroll=False)
        deadline = time.monotonic() + 15
        while True:
            home = self.find("Home", clickable=True)
            if home is not None and home.get("selected") == "true" and self.find("Between Us") is not None:
                break
            if time.monotonic() >= deadline:
                raise RuntimeError("Native navigation did not settle on Home.")
        self.require("Some things are", prefix=True)
        self.top()
        if self.find("Some things are", prefix=True) is None:
            raise AssertionError("Scrolling Home unexpectedly changed its destination.")

    def role(self, role):
        self.settings()
        self.tap(f"Switch to {role} demo")
        self.wait_visible(f"Hi, {'Sam' if role == 'child' else 'Alex'}.", timeout=15)
        self.top()

    def note(self, message):
        print(message, flush=True)
        self.log.append({"time": datetime.now(timezone.utc).isoformat(), "message": message})
        (self.root / "capture-actions.json").write_text(json.dumps(self.log, indent=2), encoding="utf-8")

    def write_manifest(self, completed=False, error=None):
        payload = {
            **self.metadata, "build_id": BUILD_ID,
            "completed": completed, "error": error,
            "capture_method": "Actual ADB shell screencap -p, adb pull, original unaltered PNG bytes",
            "screens": self.records, "actions": self.log,
        }
        (self.root / "capture-manifest.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        if any(item.get("area") == "journal" for item in self.records):
            self.journal_root.mkdir(parents=True, exist_ok=True)
            journal_payload = {**payload, "screens": [item for item in self.records if item.get("area") == "journal"],
                               "full_manifest": str((self.root / "capture-manifest.json").relative_to(PROJECT)).replace("\\", "/")}
            (self.journal_root / "capture-manifest.json").write_text(json.dumps(journal_payload, indent=2), encoding="utf-8")

    def capture(self, theme, name, description):
        destination = self.journal_root if self.area == "journal" else self.root / "core" if self.area == "core" else self.root
        BASE.CAPTURES = destination
        try:
            super().capture(theme, name, description)
            record = self.records[-1]
            record["file"] = str((destination / record["file"]).relative_to(PROJECT)).replace("\\", "/")
            record["area"] = self.area
            self.write_manifest()
        finally:
            BASE.CAPTURES = self.root

    def locate_field(self, label):
        for direction in (None, "down", "up"):
            for _ in range(1 if direction is None else 5):
                if direction:
                    self.swipe(direction)
                node = edit_text_node(self.tree(), label, self.matches, self.bounds)
                if node is not None:
                    return node
        raise RuntimeError(f"Native EditText not found: {label}")

    def field(self, label, value, dismiss_keyboard=True):
        safe_input(value)
        node = self.locate_field(label)
        x, y = self.bounds(node)
        self.command("shell", "input", "tap", x, y)
        if self.locate_field(label).get("focused") != "true":
            raise AssertionError(f"Native field did not receive focus: {label}")
        self.command("shell", "input", "keycombination", "113", "29")  # Native Ctrl+A.
        self.command("shell", "input", "keyevent", "67")
        cleared = self.locate_field(label)
        if cleared.get("text", "") not in ("", cleared.get("hint", "")):
            raise AssertionError(f"Native Select All/Delete did not clear: {label}")
        # Bulk injected keystrokes can outrun controlled inputs. Use ordinary typing pace.
        for character in value:
            self.command("shell", "input", "text", safe_input(character))
            time.sleep(0.06)
        time.sleep(0.3)
        if dismiss_keyboard:
            self.hide_keyboard()
        after = self.locate_field(label)
        if after.get("text", "") != value:
            raise AssertionError(f"Native field did not retain expected fictional value: {label}")
        self.note(f"Filled fictional field: {label}")

    def hide_keyboard(self):
        # Back is sent only while IME is visibly open; never accidentally navigate back.
        windows = self.command("shell", "dumpsys", "window")
        if re.search(r"type=ime[^\n]*visible=true", windows):
            self.command("shell", "input", "keyevent", "4")
            time.sleep(0.2)

    def require_contains(self, fragment):
        for direction in (None, "down", "up"):
            for _ in range(1 if direction is None else 5):
                if direction:
                    self.swipe(direction)
                for node in self.tree().iter("node"):
                    if self.bounds(node) and any(fragment in node.get(key, "") for key in ("text", "content-desc")):
                        return node
        raise RuntimeError(f"Native text fragment not found: {fragment}")

    def wait_visible(self, label, prefix=False, clickable=False, timeout=90):
        """Wait for a transition to render, without scrolling the outgoing screen."""
        deadline = time.monotonic() + timeout
        while True:
            try:
                node = self.find(label, prefix=prefix, clickable=clickable)
                if node is not None:
                    return node
            except (BASE.ET.ParseError, subprocess.CalledProcessError, BASE.NativeSnapshotUnavailable):
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Native transition did not reach: {label}")
            time.sleep(0.25)

    def settings(self):
        self.wait_visible("Profile & settings", clickable=True)
        super().settings()

    def launch_app(self):
        package = self.args.app_package
        self.note(f"Restarting fictional {package} process memory; appearance storage remains intact.")
        self.command("reverse", f"tcp:{self.args.port}", f"tcp:{self.args.port}")
        self.command("shell", "am", "force-stop", package)
        if package == "host.exp.exponent":
            url = f"exp://127.0.0.1:{self.args.port}"
            flags = url + "?__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1"
            # Expo Go can land at its launcher on a cold intent. Warm intents reopen
            # the exact Metro URL, without clearing storage or substituting a browser.
            self.command("shell", f"am start -W -a android.intent.action.VIEW -d '{flags}' {package}")
            time.sleep(1)
            self.command("shell", f"am start -W -a android.intent.action.VIEW -d '{url}' {package}")
            self.command("shell", f"am start -W -a android.intent.action.VIEW -d '{flags}' {package}")
        else:
            # A native debug APK is built with reactNativeDevServerPort matching
            # --port. Launch its real launcher activity, not an Expo Go URL.
            self.command("shell", "monkey", "-p", package, "-c", "android.intent.category.LAUNCHER", "1")
        self.wait_ready()
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                root = self.tree()
            except BASE.NativeSnapshotUnavailable:
                time.sleep(0.25)
                continue
            # Large text can place the onboarding action below the first viewport.
            if any((self.matches(node, "Explore as Sam") and node.get("clickable") == "true")
                   or self.matches(node, "BETWEEN US") for node in root.iter("node")):
                self.tap("Explore as Sam")
                self.wait_visible("Hi, Sam.")
                break
            if self.find("Home", clickable=True) is not None:
                break
            time.sleep(0.25)
        else:
            raise RuntimeError("Native startup did not expose onboarding or navigation controls.")
        self.wait_visible("Profile & settings", clickable=True)

    def fresh_theme(self, theme):
        self.launch_app()
        self.verify_build()
        self.tap("Light mode" if theme == "light" else "Dark mode")
        self.require("Safe Harbor" if theme == "light" else "Night Harbor", prefix=True)
        self.home()
        if self.find("Hi, Alex.") is not None:
            self.role("child")
        self.require("Hi, Sam.")

    def finance(self, destination=None):
        self.home()
        self.tap("Chores & Goals")
        self.require("FAMILY SAVINGS ENVELOPES")
        if destination:
            self.tap(destination)

    def confirm(self, title=None):
        """Confirm a finance command and require its ledger success notice.

        Model loading uses its own status waiter, never this financial assertion.
        """
        if title:
            self.require(title)
        self.wait_visible("Confirm", clickable=True, timeout=10)
        self.tap("Confirm", scroll=False)
        self.require("Updated the fictional family ledger.", prefix=True)

    def approve(self, title, theme, screenshot=None):
        self.tap(f"Approve: {title}")
        self.require("Approve this completion?")
        if screenshot:
            self.capture(theme, screenshot, "Actual parent approval confirmation; Confirm creates one fictional earning.")
        self.confirm()

    def goal(self, title):
        self.finance("Savings goals")
        self.tap(f"Open goal: {title}")

    def capture_finance(self, theme):
        self.area = "finance"
        self.finance("My chores")
        self.top()
        self.capture(theme, "child-chores", "Child chores before completion; rewards are planned, not yet earned.")
        self.tap("Mark done: Take out the recycling")
        self.tap("Mark done: Tidy my room")
        self.require("submitted by child")
        self.capture(theme, "child-awaiting-review", "Child submissions awaiting parent approval; no self-approved earnings.")

        self.role("parent")
        self.finance("Assign & review chores")
        self.top()
        self.capture(theme, "parent-chores-review", "Parent's actual completion review queue, with approval and retry controls.")
        self.approve("Take out the recycling", theme, "parent-approval-confirmation")
        self.approve("Tidy my room", theme)
        self.finance("Allowance budget & payout schedule")
        self.top()
        self.capture(theme, "allowance-budget", "Parent allowance budget and independent reminder cadence; no automatic transfer.")
        self.require("Review allowance settings")
        self.capture(theme, "payout-schedule", "Actual lower parent payout scheduling controls and explicit review action.")

        self.finance("Savings matching")
        self.top()
        self.capture(theme, "matching-setup", "Approved illustrative 100%/$20 separate-budget/Surprise setup, before explicit enabling.")
        self.tap("Enable savings matching")
        self.tap("Review matching settings")
        self.require("Save prospective matching rule?")
        self.capture(theme, "matching-enable-confirmation", "Actual prospective rule confirmation before the parent intentionally enables matching.")
        self.confirm()

        self.role("child")
        self.finance("My earnings & cash-out")
        self.require("Approved earned: $23.00")
        self.top()
        self.capture(theme, "child-earnings", "$23 of parent-approved fictional earnings before allocation, distinct from planned rewards.")
        self.goal("A new video game")
        self.field("Amount (USD)", "8.00")
        self.tap("Allocate to this goal")
        self.require("I saved: $8.00")
        self.top()
        self.capture(theme, "child-goal-before-reveal", "Child-owned $8 goal earmark; hidden parent commitments are absent from progress.")
        self.goal("A bicycle")
        self.field("Amount (USD)", "15.00")
        self.tap("Allocate to this goal")
        self.require("I saved: $15.00")
        self.finance("Savings goals")
        self.top()
        self.capture(theme, "child-goals-before-reveal", "Multiple child goals after $8+$15 allocations; only the child's own $23 is displayed.")

        self.role("parent")
        self.finance("Savings matching")
        self.require("Reserved this month: $20.00")
        self.capture(theme, "parent-match-ledger", "Actual parent-only shared monthly cap: $20 reserved, $0 cap remaining.")
        self.require("Active parent pledge: $8.00")
        self.capture(theme, "parent-match-first", "Parent-only first $8 commitment, hidden from child and not funded.")
        self.require("Active parent pledge: $12.00")
        self.capture(theme, "parent-match-second", "Second $15 child allocation produces only $12 parent pledge because the shared cap is exhausted.")
        self.tap("Reveal contribution 1")
        self.require("Reveal this contribution?")
        self.capture(theme, "parent-reveal-confirmation", "Explicit selected-contribution reveal confirmation; revealing does not fund the pledge.")
        self.confirm()

        self.role("child")
        self.goal("A new video game")
        self.require("Parent plans to contribute $8.00.", prefix=True)
        self.top()
        self.capture(theme, "child-revealed-unpaid", "Revealed $8 is a planned unpaid pledge, excluded from funded goal progress.")
        self.role("parent")
        self.finance("Savings matching")
        self.tap("Record funding for contribution 1")
        self.require("Record a parent-reported contribution?")
        self.capture(theme, "parent-funding-confirmation", "Actual manual parent-reported funding confirmation; no provider verification or money movement.")
        self.confirm()
        self.role("child")
        self.goal("A new video game")
        self.require("Parent reports contributing: $8.00")
        self.top()
        self.capture(theme, "child-revealed-funded", "Child sees own $8 and separately parent-reported $8 after explicit reveal and funding report.")

        self.finance("My chores")
        self.tap("Mark done: Water the plants")
        self.role("parent")
        self.finance("Assign & review chores")
        self.approve("Water the plants", theme)
        self.role("child")
        self.finance("My earnings & cash-out")
        self.field("Payout amount (USD)", "5.00")
        self.tap("Request cash-out")
        self.require("Reserved for payouts: $5.00")
        self.capture(theme, "child-cashout-request", "$5 request reserves only free earnings; the $23 goal earmarks remain excluded.")
        self.role("parent")
        self.finance("Payout workspace")
        self.top()
        self.capture(theme, "parent-payout-workspace", "Parent manual payout worksheet, distinct earned/earmarked/reserved/paid amounts.")
        self.field("Payout amount (USD)", "2.00")
        self.tap("Record payment for payout 1")
        self.require("Record parent-reported payment?")
        self.capture(theme, "parent-payment-confirmation", "Actual $2 partial-payment confirmation using cash; the application never initiates a transfer.")
        self.confirm()
        self.require("Remaining reserved: $3.00")
        self.capture(theme, "parent-partial-payment", "Parent reported $2 paid; remaining $3 is still reserved, never provider-confirmed.")
        self.role("child")
        self.finance("My earnings & cash-out")
        self.tap("Confirm receipt 1.1")
        self.confirm("Confirm you received this?")
        self.require_contains("child confirmed received; not provider verified")
        self.capture(theme, "child-payment-acknowledged", "Child's explicit receipt acknowledgment; still a family report rather than provider evidence.")
        self.role("parent")
        self.finance("Payout workspace")
        self.tap("Cancel payout 1")
        self.confirm("Cancel remaining payout?")
        self.require("Available, unallocated: $3.00")
        self.top()
        self.capture(theme, "parent-payout-remainder-cancelled", "Only the unpaid $3 hold is released; $2 reported payment remains in history.")
        self.finance("Financial history")
        self.top()
        self.capture(theme, "financial-history", "Append-only fictional financial activity with manual correction history; no journal content.")
        self.role("child")

    def capture_journal(self, theme):
        self.area = "journal"
        if getattr(self.args, "with_local_model", False):
            self.load_local_model(theme)
        self.home()
        self.tap("Journal", scroll=False)
        self.require("A SPACE OF YOUR OWN")
        self.top()
        self.capture(theme, "journal-overview", "Child's private fictional journal overview in the actual app.")
        if getattr(self.args, "with_local_model", False):
            self.tap("New entry")
            self.field("Entry title", "Fictional award example")
            self.field("Your private demo words", "I won an award today for my school project. I would like to tell someone about it.")
            self.tap("Save entry")
        else:
            self.tap("Revisit A little space to think")
        self.require("ENTRY TITLE")
        self.top()
        self.capture(theme, "journal-editor", "Quiet Open Letter writing surface; the current example remains in memory only.")
        self.tap("Find words to share")
        self.require("You choose the person.")
        source = self.wait_for_suggestion_source()
        self.note(f"Actual journal suggestion source in {theme}: {source}")
        if getattr(self.args, "require_local_model", False) and source != "on-device-model":
            self.capture(theme, "journal-model-fallback", "Actual local-template fallback after requesting native ideas; native output was not accepted.")
            raise AssertionError("The journal displayed templates; --require-local-model requires accepted native output.")
        self.require("Prepare separate words")
        self.capture(theme, "journal-inline-suggestions", f"Explicitly requested ideas; actual displayed source is {source}. Full starter and intentional sharing actions visible.")
        self.tap("Prepare separate words")
        self.require("Your message")
        self.capture(theme, "journal-recipient-choice", "Separate editable words require an intentional recipient selection; journal is not automatically sent.")
        self.tap("Alex")
        self.tap("Review my words")
        self.require("Review your words")
        self.capture(theme, "journal-message-review", "Actual review of exact selected recipient and separately prepared words; no simulated Send is activated.")
        self.tap("Home", scroll=False)
        self.area = "finance"

    def load_local_model(self, theme):
        self.settings()
        self.tap("On-device conversation ideas")
        control = self.locate("Load downloaded model", clickable=True)
        if control.get("enabled") == "false":
            self.note("Native model loading is disabled in this build; no automatic download attempted.")
            self.capture(theme, "optional-model-unavailable", "Actual unsupported/disabled optional model control; templates remain available.")
            if getattr(self.args, "require_local_model", False):
                raise AssertionError("The build has no enabled local-model loader.")
            return False
        self.tap("Load downloaded model")
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            root = self.tree()
            if any(self.matches(node, "Experimental on-device model loaded.", prefix=True) for node in root.iter("node")):
                self.capture(theme, "optional-model-loaded", "Actual app setup reports the previously downloaded model loaded; this is not a physical-device validation claim.")
                return True
            if any(self.matches(node, "The optional model could not", prefix=True) for node in root.iter("node")):
                break
            time.sleep(1)
        self.note("Previously downloaded local model did not reach its loaded status. No automatic download was attempted.")
        self.capture(theme, "optional-model-unavailable", "Actual model load failure/unavailable state; templates remain available.")
        if getattr(self.args, "require_local_model", False):
            raise AssertionError("Existing model failed to load; no download was authorized by this script.")
        return False

    def capture_core_supplement(self, theme):
        self.area = "core"
        self.capture_supplement(theme)
        self.home()
        self.swipe("down")
        self.require("Chores & Goals")
        self.capture(theme, "home-finance-entry", "Actual scrolled Home view showing the contextual Chores & Goals entry.")
        self.tap("Journal", scroll=False)
        self.tap("Revisit A little space to think")
        self.tap("Help me find someone to talk to")
        self.require("Prepare separate words")
        self.capture(theme, "journal-reflection-complete", "Full optional local reflection wording and deliberate sharing actions, supplementing the initial viewport.")
        self.tap("Circle", scroll=False)
        self.require("Prepare an in-person conversation")
        self.swipe("down")
        self.capture(theme, "circle-practice-action", "Actual lower Circle viewport with in-person preparation and safety actions.")
        self.home()
        self.tap("Open check-in")
        self.tap("Skip this check-in")
        self.require("Skipped. You do not owe an answer.")
        self.require("You have no new check-ins.", prefix=True)
        self.capture(theme, "child-checkin-skipped", "Actual native Skip completed without a reminder, score or penalty message.")
        self.role("parent")
        self.tap("Schedule a check-in")
        self.tap("Save example schedule")
        self.require("Example schedule saved. Notifications are simulated.")
        self.capture(theme, "parent-checkin-saved", "Parent saved the fictional schedule through its real control; delivery remains simulated.")
        self.role("child")
        self.tap("Open check-in")
        self.require("What made you smile today?")
        self.capture(theme, "child-new-checkin", "Child sees the parent's new fictional invitation, with optional response controls.")

    def wait_for_suggestion_source(self):
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            for node in self.tree().iter("node"):
                if self.matches(node, "On-device model", prefix=True) and self.bounds(node):
                    return "on-device-model"
                if self.matches(node, "Local conversation templates", prefix=True) and self.bounds(node):
                    return "local-template"
            # Results can start below the editor; ordinary swipes are real UI actions.
            self.swipe("down")
            time.sleep(0.5)
        raise RuntimeError("No actual journal suggestion source label became visible.")

    def run(self):
        branch = git("branch", "--show-current")
        if branch != "feature/mobile-foundation":
            raise RuntimeError(f"Unexpected branch: {branch}")
        if Path(git("rev-parse", "--show-toplevel")).resolve() != PROJECT.resolve():
            raise RuntimeError("Unexpected canonical Git root.")
        if "device" not in self.command("get-state"):
            raise RuntimeError("Selected Android device is unavailable.")
        sizes = re.findall(r"(\d+)x(\d+)", self.command("shell", "wm", "size"))
        self.width, self.height = map(int, sizes[-1])
        source_diff = git("diff", "HEAD", "--", "apps/mobile/src", "apps/mobile/package.json", "apps/mobile/package-lock.json")
        self.metadata = {
            "source_head_at_capture": git("rev-parse", "HEAD"), "branch": branch,
            "canonical_root": str(PROJECT), "tracked_source_diff_sha256": hashlib.sha256(source_diff.encode()).hexdigest(),
            "tracked_source_dirty": bool(source_diff), "serial": self.serial,
            "app_package": self.args.app_package, "metro_port": self.args.port,
            "local_model_requested": getattr(self.args, "with_local_model", False),
            "emulator": self.command("emu", "avd", "name").splitlines()[0],
            "model": self.command("shell", "getprop", "ro.product.model"),
            "android": self.command("shell", "getprop", "ro.build.version.release"),
            "resolution": [self.width, self.height], "density": self.command("shell", "wm", "density"),
            "section": self.args.section,
        }
        self.note(f"Native mission capture: {BUILD_ID}; {branch}; HEAD {self.metadata['source_head_at_capture']}; {self.width}x{self.height}")
        self.write_manifest()
        for theme in (["light", "dark"] if self.args.theme == "both" else [self.args.theme]):
            self.fresh_theme(theme)
            if self.args.section in ("all", "core"):
                self.area = "core"
                self.capture_theme(theme)
                self.capture_core_supplement(theme)
            if self.args.section == "supplement":
                self.capture_core_supplement(theme)
            if self.args.section in ("all", "finance"):
                self.capture_finance(theme)
            if self.args.section in ("all", "journal"):
                self.capture_journal(theme)
        self.write_manifest(completed=True)
        self.note(f"Completed {len(self.records)} genuine screenshots. Manifest: {self.root / 'capture-manifest.json'}")
        self.write_manifest(completed=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", type=Path, default=Path(os.environ["LOCALAPPDATA"]) / "Android/Sdk/platform-tools/adb.exe")
    parser.add_argument("--serial", default="emulator-5554")
    parser.add_argument("--app-package", default="host.exp.exponent", help="Installed Expo Go package or the actual native APK package, e.g. com.oxieg3n.betweenus.")
    parser.add_argument("--port", type=int, default=8082)
    parser.add_argument("--theme", choices=("light", "dark", "both"), default="both")
    parser.add_argument("--section", choices=("all", "core", "finance", "journal", "supplement"), default="all")
    parser.add_argument("--with-local-model", action="store_true", help="Load an already downloaded model through Settings for journal capture; never downloads automatically.")
    parser.add_argument("--require-local-model", action="store_true", help="Fail if the actual journal source label is a template fallback; implies --with-local-model.")
    parser.add_argument("--run-id", help="Optional stable run ID for an explicitly authorized recapture.")
    parser.add_argument("--replace", action="store_true", help="Explicitly replace files only within the chosen run after documenting the defect/fix.")
    parser.add_argument("--self-test", action="store_true", help="Check input safety and path guards without invoking ADB.")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535.")
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+", args.app_package):
        parser.error("App package must be a valid dotted Android package name.")
    args.with_local_model = args.with_local_model or args.require_local_model
    if args.self_test:
        assert safe_input("8.00") == "8.00"
        assert safe_input("Fictional example") == "Fictional%sexample"
        for invalid in ("", "$(secret)", "foo&bar", "'quote'", "x" * 201):
            try:
                safe_input(invalid)
            except ValueError:
                continue
            raise AssertionError("Unsafe shell input was accepted.")
        import xml.etree.ElementTree as ET
        duplicate = ET.fromstring('<hierarchy><node class="android.widget.TextView" text="Amount"/><node class="android.widget.EditText" content-desc="Amount" text="8.00"/></hierarchy>')
        found = edit_text_node(duplicate, "Amount", lambda node, label: node.get("text") == label or node.get("content-desc") == label, lambda node: True)
        assert found is not None and found.get("text") == "8.00"
        transition = MissionCapture.__new__(MissionCapture)
        nodes = iter((None, found))
        transition.find = lambda *unused, **kwargs: next(nodes)
        assert transition.wait_visible("Amount", timeout=1) is found
        print("PASS: bounded fictional input checks; no ADB invocation.")
        return
    capture = MissionCapture(args)
    try:
        capture.run()
    except Exception as error:
        capture.note(f"CAPTURE FAILED: {type(error).__name__}: {error}")
        capture.write_manifest(error=f"{type(error).__name__}: {error}")
        raise


if __name__ == "__main__":
    main()
