# Targeted density and reference QA - failed r8 run

Status: **failed and preserved**. The run manifest records `completed: false` and `RuntimeError: Native control/text not found: Home`. Only five light tablet screenshots were captured. A full visible privacy caption and retained writing in one light view do not close the earlier P2 across themes or establish a successful density round trip.

## Provenance

| Item | Recorded value |
| --- | --- |
| Build | `1115-FamilyEnvelopes-Journal-r8` |
| Source commit | `1b20fbb188d05cc11dcbacab62b0861b0af29786` |
| Branch / app | `feature/mobile-foundation` / `com.oxieg3n.betweenus` |
| Native environment | Pixel_10, Android 17, `emulator-5554`, Metro 8082 |
| Tablet override | 1920 x 2560 pixels, density 320, approximately 960 x 1280 dp |
| Original settings | Physical size 1080 x 2424, density 420, font scale 1.0 |
| APK build/install, supplied by master | Build successful in 1 minute 24 seconds; installed |
| APK SHA-256, supplied by master | `49B6A4D48155870D79166A4F963A2C0EFAEA5872EF1CE186134055D95619248D` |
| Evidence | [Manifest](capture-manifest.json), [actual actions](capture-actions.json), [native check results](native-check-results.json) |

The independent reviewer inspected all five original PNGs and recalculated each SHA-256 and IHDR dimension. All match the manifest and 1920 x 2560. Neither originals nor earlier r7 evidence were changed. This reviewer performed read-only source/file inspection and wrote this report; no ADB, Git, device or app-source change was made during the review.

## Actual outcome

The native result JSON reports two passed checks before the failure: light unsaved-draft retention and light tablet navigation/goal Back. The exact fictional body remained after live density change. The [retained editor](light/tablet-draft-retained.png) also visibly shows the full `Just for you` / `nothing is shared` caption. Goal detail and native Back were reached. These are narrow functional successes, not a complete visual or both-theme pass.

**Open root-layout defect:** all five tablet originals show the application occupying approximately the upper-left 1464 x 1960 of the 1920 x 2560 viewport, leaving a large blank right/lower area. Header, rail and app content share the undersized bounds; this is not merely the intentional reading-width limit inside a full-size tablet layout. The approximate width ratio 1464/1920 is close to 320/420, consistent with old-density layout constraints rendered at the new density. The precise callback/order cause has not been instrumented or proven.

After restoring phone geometry, the run could not find Home and stopped before its planned scrolled Home and opaque-reference checks. The master observed the restored app bounds extending beyond the phone viewport, hiding bottom navigation. No additional screenshot of that restored phone failure was captured in this run; the manifest/result/action JSON establish the stop. The final cleanup separately verified that size, density and font scale outputs matched the original settings, with no restoration errors. Restoring device overrides is not proof that the existing app's layout had recovered.

No dark image, actual UUID child reference or true scrolled phone Home-entry proof was captured here. The earlier clipped-caption P2 remains open pending successful both-theme targeted evidence. No inference, provider, physical-device or production-readiness pass is claimed.

## Source-backed investigation and proposed correction

Android documents that handling a configuration change transfers responsibility for adapting the Activity, while its resources reflect the new configuration. Avoiding Activity recreation alone does not guarantee a correctly sized native surface. See [Activity configuration changes](https://developer.android.com/reference/android/app/Activity#onConfigurationChanged(android.content.res.Configuration)) and [configuration handling](https://developer.android.com/guide/topics/resources/runtime-changes).

Installed React Native 0.88.1 shows the relevant path: ReactHostImpl refreshes display metrics, but requests surface layout only if its before/after SP conversion differs. ReactSurfaceView's `onMeasure` always forwards layout specs. ReactSurfaceImpl uses current resource density, and the Fabric binding updates density-independent constraints plus the layout's point scale. These source facts explain why forcing a fresh native measurement is appropriate; they do not prove which event ordering produced this run's stale bounds. Primary versioned sources: [ReactHostImpl](https://github.com/react/react-native/blob/v0.88.1/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/runtime/ReactHostImpl.kt), [ReactSurfaceView](https://github.com/react/react-native/blob/v0.88.1/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/runtime/ReactSurfaceView.kt), [ReactSurfaceImpl](https://github.com/react/react-native/blob/v0.88.1/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/runtime/ReactSurfaceImpl.kt) and [Fabric binding](https://github.com/react/react-native/blob/v0.88.1/packages/react-native/ReactAndroid/src/main/jni/react/fabric/SurfaceHandlerBinding.cpp).

The reviewed candidate adds a local MainActivity callback that calls super, then posts `requestLayout()` on the **existing** React root. Posting allows a subsequent native measurement using settled configuration resources. It does not replace the surface, restart the app, persist writing, disable font scaling or suppress linking warnings. Android documents [View.requestLayout](https://developer.android.com/reference/android/view/View#requestLayout()) and [View.post](https://developer.android.com/reference/android/view/View#post(java.lang.Runnable)). This report does not claim that the proposed correction has passed a runtime retest.

## Required follow-up

Run a separately identified build through phone to tablet and back to phone in both themes. Check the complete root/window bounds in addition to control existence; preserve the exact unsaved draft and show the full privacy caption. Verify native Back, all navigation destinations, true lower-Home entry framing and the actual UUID reference after the intended private/parent-only actions. Preserve this failed run. Hardware density changes, hot-font state restoration, spoken TalkBack and iOS remain independent release gates.

## Original integrity ledger

All five originals below were individually inspected and independently hash/dimension verified.

| Original | Pixels | SHA-256 |
| --- | --- | --- |
| [light/tablet-draft-retained.png](light/tablet-draft-retained.png) | 1920 x 2560 | `c6eb911d850bae4de07777a2f8e01340b68a992316976234448e1cd2a26f3211` |
| [light/tablet-home.png](light/tablet-home.png) | 1920 x 2560 | `f65623f0eacd5c8067a0c51420b358861a7a36d1dca52695cf62d79b9adae23c` |
| [light/tablet-goals.png](light/tablet-goals.png) | 1920 x 2560 | `ee02d87352cc41b38429c24a5d0bc17577f7d70dfb0466ddf57fef0391d3a536` |
| [light/tablet-goal-detail.png](light/tablet-goal-detail.png) | 1920 x 2560 | `bb333a3e8ee141a35a2422c1c90a084f9db96d5399139352f6da0eb9c3c3bdbc` |
| [light/tablet-goal-after-back.png](light/tablet-goal-after-back.png) | 1920 x 2560 | `d1a91d2eb1eb3b55456e58bb63023f5c0931c99ed213c59a6e92043a5b877380` |
