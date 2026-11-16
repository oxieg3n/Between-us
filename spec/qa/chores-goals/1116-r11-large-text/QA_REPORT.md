# R11 large-text check: startup stopped

No functional case passed in this attempt. The run stopped with `RuntimeError: Native transition did not reach: Hi, Sam.` after the driver recorded an Explore as Sam tap. The actual [failure original](light/failure-state.png) still shows onboarding with both demo-role buttons fully visible. It does not establish that the tap activated, why the transition failed, or any font-scale layout defect.

Runtime build: `1115-FamilyEnvelopes-Journal-r11`, unchanged app source `f0c888a924df362b0841dd9fc568db6d1e8cc59d`. Driver/capture HEAD: `38f7d640d3fa8d54a512b6f6da5d774dda290d3c`, branch `feature/mobile-foundation`. The installed clean R11 APK has the master's recorded SHA-256 `8D338023B2DD4792C23ABA3ABF1B75517B31E4D8D106308F4C457C733EB1F6F5`; this review independently verifies the PNG, not APK bytes.

[Manifest](capture-manifest.json) is `completed: false`; [actions](capture-actions.json) show startup then the attempted role entry; [results](native-check-results.json) contain one failure and verified device restoration with no errors. Pixel_10, Android 17 x86_64, original 1080 x 2424, density 420, font scale 1.0. One AVD is used. No 200% interaction or dark-theme case was reached. No density/caption/reference gate is closed by this attempt.

The sole original came from actual ADB screencap/pull and was individually viewed. Branding, tagline, introductory text and Sam/Alex actions fit the viewport. Original PNG bytes remain unchanged. Independently recomputed IHDR dimensions and SHA-256 match the manifest:

| Original | Dimensions | SHA-256 |
|---|---|---|
| [light/failure-state.png](light/failure-state.png) | 1080 x 2424 | `2343278d0841b281841fa06985daa992b1f90bc7838a6f2f2728485ffbefee82` |

This failure remains historical evidence. A subsequent run must provide its own completed manifest and actual interaction results; none are inferred here. No ADB, source, package or Git changes were made by this reviewer.
