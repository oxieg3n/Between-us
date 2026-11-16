# R11 dark large-text SwiftShader attempt: System UI ANR

This attempt did not pass any functional case. Startup stopped with `RuntimeError: Between Us did not reach its native header within the startup wait.` The [actual original](dark/failure-state.png) shows an Android dialog stating **System UI isn't responding**, with Close app and Wait actions, over rendered Night Harbor onboarding. It is a concrete system-level obstruction, not evidence of a missing app header or a failed 200% control layout. The manifest is `completed: false`.

## Runtime and environment

- Unchanged app build `1115-FamilyEnvelopes-Journal-r11`, runtime source `f0c888a924df362b0841dd9fc568db6d1e8cc59d`, master-recorded installed APK SHA-256 `8D338023B2DD4792C23ABA3ABF1B75517B31E4D8D106308F4C457C733EB1F6F5`.
- Unchanged driver/capture HEAD `4442c4858d79ed07ca0ce776aeb6ab6b0b0231f5`, branch `feature/mobile-foundation`. Pixel_10 AVD, Android 17 x86_64, original size 1080 x 2424, density 420 and font scale 1.0.
- After the [previous corrupted frame](../1116-r11-large-text-v3/QA_REPORT.md), the master stopped only the verified Pixel_10 emulator and cold-booted the same AVD using `-gpu swiftshader -memory 4096 -no-snapshot-load -no-snapshot-save`, without wiping data or modifying AVD configuration. The app remained installed. The master recorded guest SurfaceFlinger GLES as Google SwiftShader after boot; the host Qt frontend also logged a graphics-library fallback, so this is not a claim that every host GPU path disappeared.
- This reviewer independently compared the current AVD config.ini SHA-256 to the before-restart diagnostic: both are `E0ABB4B4337204021E315C04B7887E369D97246A1608072B67D1C201C2A36652`. No AVD settings were changed by this reviewer.

[Android's emulator troubleshooting guide](https://developer.android.com/studio/run/emulator-troubleshooting) recommends the SwiftShader rendering option for graphics glitches. It was used as an environment workaround. The simultaneous cold boot is a confound: this run does not prove the earlier corruption's root cause or establish that software rendering resolves stability. The current ANR needs investigation. The captured dialog names System UI; that observation alone does not prove which workload or component caused the system to become unresponsive.

## Actual evidence and limits

[Manifest](capture-manifest.json), [actions](capture-actions.json), [native results](native-check-results.json). Zero font/theme interaction cases completed. The original shows dark onboarding behind the system dialog, but is not a valid dark large-text acceptance capture. No 200% font result, density/root closure or native UUID closure follows from this attempt. The results separately record original size/density/font restoration with no errors. The earlier LIGHT 200% case remains passed within its failed overall run, without converting either attempt into a both-theme pass.

The sole original was individually inspected and independently checked against the manifest. It has readable onboarding behind the modal and no tiled scan-line artifact seen in the earlier failure; however the System UI dialog blocks interaction. Only fictional demo content appears. PNG bytes were captured using actual ADB screencap/pull and remain unchanged.

| Original | Dimensions | SHA-256 |
|---|---|---|
| [dark/failure-state.png](dark/failure-state.png) | 1080 x 2424 | `ace989b9eb5cc55cdc25f9b86f0dc5f17f463bf908a09422471e6ecf4f94473a` |

The application is not certified for physical Android/tablets, iOS, TalkBack or production identity/privacy by this evidence. There was no real transfer or message delivery. This reviewer performed no ADB, app source, package or Git changes.
