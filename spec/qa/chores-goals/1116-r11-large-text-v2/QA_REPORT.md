# R11 large-text second attempt: fresh startup snapshot unavailable

No functional case passed. This run stopped with `RuntimeError: Fresh native UI snapshot unavailable; no stale coordinates used.` The [sole actual original](light/failure-state.png) shows the branded native splash. The manifest is `completed: false`; this attempt supplies no 200% layout/interaction, dark-theme or density/reference acceptance evidence.

Runtime `1115-FamilyEnvelopes-Journal-r11` and installed APK are unchanged: app source `f0c888a924df362b0841dd9fc568db6d1e8cc59d`, master-recorded APK SHA-256 `8D338023B2DD4792C23ABA3ABF1B75517B31E4D8D106308F4C457C733EB1F6F5`. Driver/capture HEAD `fb4cdf9c973fa89c1e95dc16a6cc21bafcdb1a5d`, branch `feature/mobile-foundation`. Pixel_10, Android 17 x86_64, original 1080 x 2424 at density 420 and font scale 1.0. The results separately record successful restoration with no errors.

The driver now uses a unique owned XML pathname for each native hierarchy attempt, requires dump-success output and parses only that fresh file, avoiding stale coordinates after a failed dump. This failure occurred during startup, where the new transient snapshot failure could escape the existing bounded readiness loop. A subsequent driver correction must keep freshness checks and distinguish retryable snapshot unavailability from genuine navigation/assertion failures. The exact cause of each earlier tap failure remains unproven; none is retrospectively declared passed.

[Manifest](capture-manifest.json), [actions](capture-actions.json), [results](native-check-results.json). The PNG was individually inspected, and its original IHDR dimensions and SHA-256 were independently recomputed and matched the manifest. No original bytes were changed.

| Original | Dimensions | SHA-256 |
|---|---|---|
| [light/failure-state.png](light/failure-state.png) | 1080 x 2424 | `92e11200540e0e84ba6d2d2c522b405c45380b849ae39390aa5f804f6207220c` |

The splash itself has the approved symbol on a light background. Its absence of app controls is a startup state, not proof of clipped controls. No physical-device, iOS, TalkBack, production privacy or real financial-transfer validation is claimed. This reviewer made no source, package, Git or ADB changes.
