# Native density-change regression

Status: targeted configuration correction implemented; r7 native verification remains pending. The successful phone cases below do not establish a passed tablet, font-scale or keyboard run.

## Preserved evidence

The original [post-restoration onboarding PNG](post-restoration-onboarding.png) was captured **after** the failed test's cleanup restored the normal device configuration. It is 1080×2424 at the original density 420 and font scale 1.0; **it is not a tablet screenshot**. Independently recomputed SHA-256: `4fdf196eb9ca313b3586dd454df90f7a795be4bfb8e30037d612c77d1c023d5d`.

The image shows the fictional onboarding screen and an Expo Router warning beginning “Looks like you have configured linking in multip…”. It is an unchanged actual ADB capture, not a mockup or a screenshot edited to show the warning.

The failed [r6 native usability manifest](../1115-r6-native-usability/capture-manifest.json) and [actual check results](../1115-r6-native-usability/native-check-results.json) identify build `1115-FamilyEnvelopes-Journal-r6`, source `1f3ac9948e766d98d5a25026758918abc751487f`, Pixel_10 AVD and Android 17. They record `completed: false`, failure to find Home, and verified restoration of size, density and font scale with no restoration errors.

| Recorded light-mode case | Result before the failure |
| --- | --- |
| Small phone: 840×1680, density 420, 320×640 dp | Four navigation controls fully visible; native Back returned from goal detail to overview. |
| Standard phone: 1080×2424, density 420, 411×923 dp | Same navigation and goal Back checks passed. |
| Large phone: 1260×2730, density 420, 480×1040 dp | Same navigation and goal Back checks passed. |
| Tablet transition: density 420 → 320 | App restarted to onboarding and showed the duplicate-linking warning; the tablet case did not pass. |

These were viewport overrides on one emulator, not separate phone/tablet hardware. Cleanup ran despite the failure and independently queried the original configuration afterward.

## Targeted correction

The platform reviewer verified React Native 0.88's density-change handling. The new local Expo config plugin adds **only `density`** to MainActivity's configuration-change flags, preserving all existing flags and other activities. It adds no custom activity, `fontScale` override, text-scale suppression or warning suppression.

The focused configuration regression passes, checking the narrow manifest change and preserving existing settings. The r7 full 69-unit QA gate and final APK build are running at this checkpoint; this report does not treat them, or the native correction, as already passed.

## Required r7 native checks and limits

1. Install/verify r7 and repeat actual small/standard/large/tablet navigation and goal-detail Back checks in both themes.
2. Type an unsaved fictional journal entry before a **live density change**. Confirm the existing screen, exact writing and focus/navigation state survive without an onboarding restart or duplicate-linking warning. The updated harness now checks draft retention rather than merely continuing after a restart.
3. Test 200% font scale by applying the OS-managed setting and cold launching the app. Check readable layout, scrolling and reachable modal actions, then restore and verify every original override. This preserves platform text scaling rather than disabling it to keep a test alive.
4. Run the separate real-IME keyboard/review interactions and capture original evidence, including any further failure.

A cold 200% font test does **not** prove unsaved-state restoration during a live font-setting change. Hot-font restoration, physical-device density/font behavior, spoken TalkBack and iOS remain unverified by this evidence and need separate testing/design before production claims. No native recovery result is claimed until the new run completes.

The r6 failure and original post-restoration image remain preserved. This reviewer changed only this report; no app source, Git state, image bytes or Android state was modified.
