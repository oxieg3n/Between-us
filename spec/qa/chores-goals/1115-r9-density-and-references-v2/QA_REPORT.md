# Failed isolated r9 density round-trip

Status: **failed and preserved**. The posted React-root remeasurement change did not establish a reliable density round trip. This isolated run reached a correct light tablet view, then failed its strict phone-restoration geometry check after a bounded 30-second wait. It is not a both-theme pass.

| Provenance | Value |
| --- | --- |
| Build / source | `1115-FamilyEnvelopes-Journal-r9` / capture HEAD `5b2ae211b933f6da14bd395d5b596547ef77e8df` |
| Native app source | `443a2e6cf2e9b43b95f437344504b3be7e41ce39`; later capture HEAD adds the bounded geometry driver |
| Device | Pixel_10 AVD, Android 17, `emulator-5554`, Metro 8082 |
| Tablet override | 1920 x 2560, density 320 |
| Original settings | 1080 x 2424, density 420, font scale 1.0 |
| Evidence | [Manifest](capture-manifest.json), [native results](native-check-results.json), [actions](capture-actions.json) |
| Manifest result | `completed: false`; `AssertionError: Display layout did not settle within the bounded wait: Header does not reach the current viewport's right edge after display change.` |

The master ran this retry after the automated/export gate ended and restarted its owned Metro process cleanly. No concurrent test, export, native build, source mutation or second ADB operator was active during the retry. This controls the earlier development-refresh confound; it does not identify the exact native defect.

All five light originals were independently inspected and checked against their manifest SHA-256 and 1920 x 2560 dimensions. All five match. The tablet caption is complete, the exact unsaved fictional text survives and the app fills the viewport. Native goal detail/Back also passed. Rail bounds include Home `[16,334,202,844]` and Circle `[16,1971,202,2480]`. These successful tablet observations do not cancel the subsequent failed phone check.

The failure occurs after restoring phone geometry. The driver requires two consecutive complete-geometry samples within 30 seconds and retains the full right-edge/header assertion. Waiting for those samples did not recover acceptable layout. The result JSON records two narrow passes, the failure, and verified restoration of original device overrides with zero cleanup errors. No restored-phone screenshot, dark view, opaque child-reference check or lower-Home entry proof was captured by this retry. The original caption P2 and density round-trip issue therefore remain unclosed by r9.

The [first r9 target](../1115-r9-density-and-references/capture-manifest.json) failed the same right-edge assertion before capturing a PNG. Separate [manual-observation metadata](../1115-r9-density-and-references/manual-observation/manifest.json) preserves two native images and geometry samples, including a visible development-refresh bar. Those observations were a diagnostic confound, not grounds to declare a fixed app. This isolated retry demonstrated that the failure persisted without the concurrent resource activity.

Source review identified a plausible nested native-screen state issue: its native layout callback updates density-dependent DP state only when pixel geometry changes or state is invalidated; its descriptor then uses that stored state to size Yoga content. That is source-backed inference, not an instrumented root cause. The master subsequently chose the smaller application-level change: remove the unused outer native Stack around the single index route, using the official Expo Slot layout while preserving the app's existing state/navigation. Official [Expo layout documentation](https://docs.expo.dev/router/basics/navigation-layouts/#slot) supports Slot for layouts without a navigator. Actual r10 evidence is still required; this failed report does not claim that later change passed.

All originals and failed results remain unchanged. This review made no app, Git, ADB, native or image edits. Physical hardware, spoken accessibility, iOS and hot-font state restoration remain separate limits.

## Original integrity ledger

| Original | Pixels | Independently verified SHA-256 |
| --- | --- | --- |
| [light/tablet-draft-retained.png](light/tablet-draft-retained.png) | 1920 x 2560 | `d3f8315d45f427baad86b1cdd98b84829a134e45ae63dab5ec196d492f43a471` |
| [light/tablet-home.png](light/tablet-home.png) | 1920 x 2560 | `64f3945def1c0ecf3129dcfcefb1cee03d46df2d104eae3ec107364eaf7a7790` |
| [light/tablet-goals.png](light/tablet-goals.png) | 1920 x 2560 | `5d5d982c9a1fecf80147e1491fddc28c17915cbe3a6752e8e2b1a32459f5af05` |
| [light/tablet-goal-detail.png](light/tablet-goal-detail.png) | 1920 x 2560 | `5620027742fa4f1e0d1520885b607493201a36442455fdfdf88da767b4c248df` |
| [light/tablet-goal-after-back.png](light/tablet-goal-after-back.png) | 1920 x 2560 | `a205acaae1ba8de5573cbad14d67abcc16f3280fc7fb0cf6d11d23831cc34ff3` |
