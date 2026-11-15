# Open Letter native visual QA

## Build and environment

**Status: R2 baseline capture/review complete; final design QA is pending R3 fixes and native retest.** Subsequent native keyboard/font testing found the defects recorded below. The keyboard-dismissed screenshots alone do not establish interaction completion.

Final application build: **1114-OpenLetterRedesign-r2**, app version **0.2.1**. Frozen application source: `0707b124ebf53b676f24fb637a6c28bb002f8436`. Branch: `feature/mobile-foundation`.

Screens were captured from the running React Native application in **Expo Go SDK 58**, on **Pixel_10 / emulator-5554**, Android **17**, model `sdk_gphone16k_x86_64`, at **1080 × 2424 pixels**. This is an emulator runtime inspection, not a standalone APK or physical-device certification.

The capture agent navigated actual native controls using UIAutomator labels and ADB taps/swipes. It verified the build string in Settings, chose both appearances through the app's real settings, and saved original PNG bytes with `adb shell screencap -p` and `adb pull`. Only fictional Sam, Alex and Teacher Lee fixture information appears. No journal text, messages, contacts or schedules were edited during the capture pass.

## Required captures

All **24 required images** were captured successfully from R2. None are browser renders, generated artwork or static design files. Each link below is repository-relative to this report.

| Screen | Safe Harbor | Night Harbor |
| --- | --- | --- |
| Child home | [Light](light/child-home.png) | [Dark](dark/child-home.png) |
| Parent home | [Light](light/parent-home.png) | [Dark](dark/parent-home.png) |
| Journal overview | [Light](light/journal-overview.png) | [Dark](dark/journal-overview.png) |
| Journal writing editor | [Light](light/journal-editor.png) | [Dark](dark/journal-editor.png) |
| Journal conversation suggestion | [Light](light/journal-reflection.png) | [Dark](dark/journal-reflection.png) |
| Conversation list | [Light](light/conversations.png) | [Dark](dark/conversations.png) |
| Active conversation | [Light](light/active-conversation.png) | [Dark](dark/active-conversation.png) |
| My Circle | [Light](light/my-circle.png) | [Dark](dark/my-circle.png) |
| Parent contact management | [Light](light/parent-contacts.png) | [Dark](dark/parent-contacts.png) |
| Open the Door scheduler | [Light](light/checkin-scheduler.png) | [Dark](dark/checkin-scheduler.png) |
| Child check-in | [Light](light/child-checkin.png) | [Dark](dark/child-checkin.png) |
| Appearance settings | [Light](light/appearance-settings.png) | [Dark](dark/appearance-settings.png) |

The initial viewport is preserved in each required image. Longer screens intentionally scroll. The reflection image focuses the optional suggestion after it is revealed; it does not crop or alter the native viewport.

Additional lower scheduler views show days, time, preview and Save: [light](light/checkin-scheduler-preview.png), [dark](dark/checkin-scheduler-preview.png). Supplemental captures cover the build footer, child later/skip controls, parent management actions and the actual removal confirmation dialog; the dialog is canceled without removing a contact. The supplemental manifest records these separately from the required matrix.

There are **34 final native screenshots** in total: the 24 required views, two scheduler previews and these eight interaction/build views:

| Additional evidence | Safe Harbor | Night Harbor |
| --- | --- | --- |
| Build identifier in Settings | [Light](light/build-identifier.png) | [Dark](dark/build-identifier.png) |
| Child later/skip controls | [Light](light/child-checkin-actions.png) | [Dark](dark/child-checkin-actions.png) |
| Parent management actions | [Light](light/parent-contact-actions.png) | [Dark](dark/parent-contact-actions.png) |
| Removal confirmation, canceled | [Light](light/contact-removal-confirmation.png) | [Dark](dark/contact-removal-confirmation.png) |

## Comparisons

The four sheets use **unscaled full source screenshots**, Safe Harbor on the left and Night Harbor on the right. Only neutral margins and theme/screen labels were added outside the screenshot pixels. Each sheet is **2256 × 2606 pixels**, retaining both original **1080 × 2424** viewports.

- [Home comparison](comparisons/home-side-by-side.png)
- [Journal comparison](comparisons/journal-side-by-side.png)
- [Conversation comparison](comparisons/conversation-side-by-side.png)
- [Navigation comparison](comparisons/navigation-overview.png)

## Review performed

The capture and design agents inspected the required native views and the four comparison sheets. The review checked alignment, safe areas, fixed bottom navigation, selected states, wrapping, editorial hierarchy, body readability, paper treatment, incoming/outgoing message distinction, input surfaces, branding, privacy wording and simulated-action labels. Native accessibility names were used to navigate the application rather than relying only on screenshots.

Sampled blank screenshot-margin pixels agree with the approved backgrounds on every required screen: **#F7FAFC** in Safe Harbor and **#172730** in Night Harbor. Night Harbor uses slate paper/input surfaces and light text; it is not an inverted light screen. The Ivory plate behind the exact approved brand symbol is intentional to preserve its dark outlines. The status bar changes appropriately between themes.

The journal editor preserves a comfortable multiline writing area, with Save/Saved status visible and the optional conversation action below. The reflection remains communication-only and visibly offers separate words, an in-person option and dismissal. Chat bubbles have distinct alignment/color and a separate composer above bottom navigation. Contact lists use rows; administrator actions stay on the person screen rather than exposing journal access. Child check-ins visibly offer later and skip without pressure.

No significant clipping, overlapping controls, missing glyphs or forgotten light surfaces inside dark mode were found in the final baseline phone images. Some long content naturally continues below the viewport and can be reached by native scrolling. Disabled Save/Review controls are intentionally muted; they are not enabled actions with falsely reported success.

## Defects found and fixes verified

1. **Weekday selection was invisible.** In the first native scheduler capture, all seven day buttons looked identical despite Friday being selected. Capture was paused, and the design agent added a soft selected fill, primary outline/text and accessible selection state. R2 was type/lint/unit/browser checked by the master, then all 24 required views were recaptured. Friday is now plainly selected in both scheduler preview images. The resulting 4+3 wrap is natural and remains readable/reachable.
2. **Brand outlines needed protection at night.** R2 gives the original symbol a small Ivory surface rather than recoloring or replacing the image. The final dark home/Circle screenshots and comparisons show the complete recognizable mark.
3. **Capture obstruction, not an app defect.** Expo Go's developer menu and floating Tools control initially obscured the app/header target. The agent inspected the real native screen, closed the menu and relaunched with Expo's developer-FAB/onboarding suppression flags. Final review images contain the app without that overlay. Initial debug images and logs are preserved as capture history rather than presented as final design evidence.

Pre-fix baseline images are preserved under [baseline-ed96bd1](baseline-ed96bd1/). They are not the final R2 set. No production demo or prior-session screenshot was overwritten.

## Interaction and accessibility limits

The native capture exercised onboarding, Settings/build identification, immediate light/dark selection, parent/child switching, all four tabs, journal opening, saved-entry reflection, conversation opening, contacts, parent scheduler and child check-ins. Supplemental removal confirmation is opened and canceled. Capturing a control does not prove that a future delivery backend exists; messaging, verification, reporting, scheduling and notifications remain simulated.

The master separately records TypeScript/lint/unit/browser/axe checks and serial native keyboard, size, font and smoke checks. Native UIAutomator names establish that these controls are discoverable, but this is not a complete TalkBack or VoiceOver audit. No iOS runtime testing, physical-phone testing, production authentication, encryption, secure journal storage, delivery or abuse-response operation is certified here.

## Remaining work

Subsequent native input testing found two defects outside the keyboard-dismissed baseline matrix: the conversation composer/Review action appeared behind visible Gboard, and at 200% font scale the journal's private-status row overflowed horizontally. The initial accessibility-bounds keyboard check was a false positive because it checked physical-screen bounds rather than the area above the IME. The master assigned the shell keyboard correction to the messaging agent and is correcting journal privacy-label wrapping. Final design QA remains open until the actual corrected keyboard/font views are inspected and R3 is retested/recaptured.

Follow-up usability work should test families with longer names/content, multilingual text, screen readers and prolonged writing interactions. Contextual nested screens use a Back header and neutral tab states; highlighting their parent tab could improve wayfinding. The tablet rail is functional but its flex-expanded selected area is taller than a conventional compact rail group; compact grouping is future visual polish. Android launcher masking and small-icon recognition still need a standalone application build.

Additional device-size/font/keyboard results are appended by the master after the screenshot agent releases exclusive ADB access. Until such a record exists, do not infer those checks from the baseline 1080 × 2424 screenshots.

## Reproduction and evidence

From `apps/mobile`, while the tested app is running in the emulator and the master has frozen source:

```powershell
python .\scripts\capture-open-letter.py
python .\scripts\capture-open-letter.py --supplement
powershell -NoProfile -File .\scripts\open-letter-comparisons.ps1
```

The capture script refuses to overwrite images unless `--replace` is explicitly supplied for a documented recapture after preserving the prior set. The comparison script similarly requires `-Replace` for existing sheets. Capture scripts use no third-party image dependency.

[Required capture manifest](capture-manifest-both.json) includes source SHA, build, device/resolution, action log and SHA256 for every required PNG plus scheduler preview. [Supplemental capture manifest](capture-manifest-both-supplement.json) records the extra controls/build/dialog evidence. These manifests describe source provenance even though evidence files were still uncommitted when captured.

Evidence checks passed: all 34 native PNG hashes match their manifests and all are 1080 × 2424; all four comparisons are 2256 × 2606; every report link resolves. The screenshot agent inspected the supplemental dialogs/build controls and all comparison sheets without altering source screenshots. No required screen is missing. Initial failed capture logs, developer-overlay debug PNGs and native XML were moved without deletion/overwrite into [baseline debug history](baseline-ed96bd1/debug/), keeping the final root manifests unambiguous.
