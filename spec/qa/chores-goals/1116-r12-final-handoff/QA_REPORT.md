# Final owner handoff

Build `1115-FamilyEnvelopes-Journal-r12`, runtime source `8607573e37dadd66ede3bb368389e0a2531ef6d8`; Pixel_10 Android 17 x86_64 at 1080 x 2424/density 420/font scale 1.0. These two original ADB captures are handoff evidence, not additional functional test cases. The main Between Us app is on Sam Home with Follow device appearance selected; the separate runtime probe is stopped. Metro serves the unchanged tested runtime on localhost:8082.

The master viewed both originals and independently verified PNG dimensions and SHA-256 against the completed/error-null manifest. Both show only fictional fixtures; no rendering corruption or clipped controls were found. The general capture helper's default routing area is named finance in its manifest; no financial command was performed in this handoff. The explicit section and actual images identify its scope.

Original emulator power settings were restored and queried: `screen_off_timeout=2147483647`, `stay_on_while_plugged_in=1`. Size/density have no overrides; font scale is 1.0. The existing AVD config.ini hash remains `E0ABB4B4337204021E315C04B7887E369D97246A1608072B67D1C201C2A36652`, matching the before-restart record. Task-local SwiftShader launch options did not edit that configuration or wipe app data. Model files remain available; test content is memory-only. No new simulated message or payment occurred.

| Original | Dimensions | SHA-256 |
| --- | --- | --- |
| [system/appearance-settings.png](system/appearance-settings.png) | 1080 x 2424 | `3c6fc22f56aadefa8524d6a68d5f0f2866a8c22bbe4bfbe135be6b86c5c4ade6` |
| [system/child-home.png](system/child-home.png) | 1080 x 2424 | `09d62628c9dce80efa4633922017a8698211432d574d18dd00157bcf23ff7440` |

[Manifest](capture-manifest.json), [actual actions](capture-actions.json). Historical failures remain preserved; these handoff images do not certify physical performance, spoken accessibility, iOS or production security.
