# Staging r1 Android visual QA

Build `1116-StagingQualification-r1`, mobile0.5.0/code4; actual Pixel_10 Android17/API37 x86_64 emulator. [Capture hashes, dimensions and native APK identities](SCREENSHOT_MANIFEST.json) distinguish the original debug APK from the final corrected binary. JavaScript was served live by Metro during capture; these are not signed-release screenshots or frozen hosted-staging proof.

**28 original ADB PNGs and4 comparison sheets** are retained. That includes duplicated/setup/error evidence, not28 passed workflows or24 distinct screen/theme cases. Existing [p3 screenshots](../p3/) and Open Letter history remain unchanged. No browser mockup or generated image is presented as Android. Private writing was never exposed by disabling capture protection.

| Review | Observed outcome / evidence |
| --- | --- |
| Actual roles | Guardian Sam and child Alex signed in with their distinct fictional credentials. [Light guardian](light-parent-home.png), [dark guardian](dark-parent-home.png), [light child](light-child-home-reverified.png), [dark child](dark-child-home-reverified.png). The initial persisted account was child Alex; initial photos were renamed child-home-initial instead of mislabelled parent. |
| Approved art/themes | Original approved symbol unchanged. Night Harbor's white backplate became a rounded Mist surface; outlines remain readable. [Appearance light](light-appearance.png), [dark](dark-appearance.png). Native-stack status-bar icons now contrast in both modes. |
| Messaging/Circle | [Chats light](light-chats.png), [dark](dark-chats.png), [Circle light](light-circle.png), [dark](dark-circle.png). Selected states/readability reviewed. Circle has an intentional horizontal section strip and vertically scrollable contacts; offscreen controls are not claimed simultaneously visible. |
| Large text | [Before navigation correction](dark-font-200-home.png) split Journal across lines. [Corrected actual200%](dark-font-200-home-nav-fixed.png) shows the whole word with all four tabs. Internal padding changed; font scaling and minimum hit target retained. Normal, small/large/tablet viewports were visually inspected; combined every-size/every-font matrix is not claimed. |
| Sizes | [Small](dark-small-home.png), [large](dark-large-home.png), [tablet](dark-tablet-home.png). Same AVD viewport/density overrides, not three physical devices. Main action and four tabs remain reachable; lower content scrolls. Original geometry restored. |
| Keyboard/private drafting | Actual editor/Review bounds above IME; hot200% retained draft in the same process; review/back retained it, then the fictional unsent text was erased without sending. No protected editor/review screenshot was captured. Final corrected APK still sets actual window FLAG_SECURE on a conversation. |
| Offline public safety | [Actual cold-start Help](dark-offline-public-help-final.png) with both emulator Auth/API routes removed; restored in finally. Source services stayed running. No guardian approval or live backend required. |
| TalkBack | [Actual app Circle focus](talkback-app-focus-1.png) proves native service/focus, not spoken usability. Setup/notification prompt retries are deliberately preserved in talkback-setup-retry files. Full auditory journey is PARTIAL/UNTESTED; service and optional notification grant restored afterward. |

## Comparisons

Each sheet adds labels above complete, unaltered source viewports; Safe Harbor left/Night Harbor right. No cropping or defect retouching.

- [Guardian Home](comparisons/parent-home-side-by-side.png)
- [Child Home](comparisons/child-home-reverified-side-by-side.png)
- [Appearance](comparisons/appearance-side-by-side.png)
- [Chats](comparisons/chats-side-by-side.png)

## Failures and corrections

The cold emulator initially booted slowly. Some own-launch attempts found Metro busy before a2-second status deadline; bounded20-second readiness now waits without killing or replacing any listener. Credential automation initially tapped static field labels, not editable nodes; the helper was corrected and real parent/child sign-ins verified. A script assumed the editor must immediately remain visible after backgrounding; conceal/recheck is intended, so that assertion is not counted as a successful full background test.

The first permission correction removed normal DETECT along with photo access, but installed SDK source eagerly registers a callback. No native crash is inferred from that review alone. Normal DETECT was retained, unused READ_MEDIA_IMAGES blocked, stale non-clean-CNG removal repaired by a tested plugin. Corrected binary launched and protected-window behavior passed. Early outage probes had readiness/short-wait assumptions; only the final cold no-route Help result is accepted.

Remaining release gates: actual physical ARM64, hardware-backed key/biometric lifecycle,15-minute native lease/2-minute idle matrix,20+ model hardware generations/thermal/RAM, full TalkBack readout, macOS/iOS/VoiceOver, actual push and owner-signed release. See [hardware ledger](../../../production/staging/HARDWARE_ACCESSIBILITY_QA.md) and [NO-GO](../../../production/staging/FINAL_RELEASE_QUALIFICATION.md).
