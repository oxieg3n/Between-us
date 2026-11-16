# Native Screen-state compatibility candidate

This provisional LIGHT-only diagnostic completed successfully: five functional cases passed, all ten original Android PNGs were captured, and the original device size, density and font scale were restored. It is evidence for the narrow compatibility fix, not final clean-build closure of the density, privacy-caption or reference QA gates.

## Provenance

- Capture manifest: [capture-manifest.json](capture-manifest.json), `completed: true`, `error: null`; actual interactions: [capture-actions.json](capture-actions.json); assertions: [native-check-results.json](native-check-results.json).
- Pixel_10, Android 17, x86_64; one AVD with viewport overrides. Original phone 1080 x 2424 at density 420, font scale 1.0; tablet override 1920 x 2560 at density 320.
- The manifest identifies `1115-FamilyEnvelopes-Journal-r10` and HEAD `b7760b9f6cc457ef20aa7030d1279f5a9799d23b`. These labels do **not** completely identify the candidate: the working tree restored the original Expo Router Stack, and the ignored generated MainActivity contained temporary native metadata probes and the candidate frame-state refresh helper. Those native changes were not represented by that HEAD.
- Master-recorded candidate build: successful 1m7 compilation and installation; APK SHA-256 `1CAD193B71C860C56CA538C150D6BB597089AB13EC1103E64D511C7F707400AC`. This report independently verifies the PNG bytes below, not the APK build log or APK bytes.
- Capture uses actual ADB `screencap -p` and pull, preserving original PNG bytes. No browser renders or generated images are used. Only fictional information is shown.
- The separate [metadata diagnostic](../1115-native-density-metadata-diagnostic/native-geometry.log) records native class/geometry/density only. A candidate-folder copy of `native-geometry.log` was absent at this review checkpoint; no local-copy contents or hash are asserted here.

## Actual results

1. **Live unsaved writing survived:** native fields were filled before the density change, then exact unsaved text was verified. The retained editor shows the complete privacy caption, "Just for you - nothing is shared" (the UI uses a middle dot), full Save action and the fictional sentence "Fictional writing stays here while display size changes."
2. **Tablet navigation and Android Back passed:** Home, Journal, Chats and Circle remain in the full-height rail. The goal detail opens and native Back returns to the overview. The recorded rail bounds end near the lower viewport: Circle `[16,1971,202,2480]`.
3. **Both directions of density geometry passed:** the driver required two successive complete geometry samples at tablet size and again at the restored phone size. The restored-phone original shows the correctly placed right header action and all four bottom destinations. No app restart was used to obtain this round trip.
4. **Native opaque reference passed:** after a private fictional journal save and a parent-only hidden matching-setting change, a child-created savings goal produced `local-a0d73231-30ee-440c-9c29-effa9d92b47f`. The reference is a UUIDv4 and wraps fully within the child history viewport. The displayed history does not expose the journal contents or hidden parent configuration. This single runtime trace is not a complete security proof.
5. **Appearance persistence passed:** Safe Harbor remained selected after force-stop/relaunch without selecting it again. The final Settings capture shows Follow device appearance selected. Both settings screens are legible, with all four navigation labels visible.

The results file separately records device restoration as `verified restored`, with no errors. This is five functional passes plus one restoration result, not six functional cases.

## Visual review

All ten originals were inspected individually. The tablet editor's complete privacy caption, writing and Save action fit; the tablet Home and savings screens use the full viewport rather than the earlier undersized native subtree. The restored phone uses its full width and visible bottom navigation. The child UUID reference wraps without clipping or horizontal overflow. The genuine scrolled Home capture shows the complete Chores & Goals action and description above bottom navigation.

Chores & Goals remains below the initial phone fold; the scrolled capture demonstrates reachability and framing, while initial discoverability remains polish. These candidate-only light images do not replace the requested clean both-theme evidence or relabel prior failed captures. No significant clipping was found in these ten originals.

## Narrow candidate and remaining gates

The native candidate refreshes the public frame state of existing attached, positive-size PUSH Screens inside a ScreenStack after the Activity configuration callback and a posted root layout request. It does not recreate the root, reset navigation, persist a journal, edit vendor files or use reflection. Native metadata showed the ReactSurfaceView and density caches updating while a nested Screen subtree later used stale measurements. The density-dependent Screen-state explanation is supported by installed source and the candidate result; the precise asynchronous event ordering remains an inference.

The reviewed promotion adds current-root/attached/not-destroyed guards and removes all temporary metadata probes. Clean R11 was still awaiting its actual full native run at this report checkpoint. Formal P2 caption/root geometry/reference closure requires that clean run in both Safe Harbor and Night Harbor, followed by regression checks. This candidate does not certify physical Android, iOS, spoken TalkBack, hot font-scale draft retention or production authentication/privacy. Simulated finance remains memory-only and no money moved.

## Original PNG verification

All ten SHA-256 values and PNG IHDR dimensions were independently recomputed from the original files and matched the manifest. Five tablet images are 1920 x 2560; five phone images are 1080 x 2424. No originals were modified.

| Original | Dimensions | SHA-256 |
|---|---|---|
| [light/tablet-draft-retained.png](light/tablet-draft-retained.png) | 1920 x 2560 | `1718be7e1232ea192833a1f71ff8e13b74eab892cd8c612de24d28662b10bdc9` |
| [light/tablet-home.png](light/tablet-home.png) | 1920 x 2560 | `01c3157f91de2c4cc3f0efa0be2e8cdceeb09c7137a1dd1db632c92c53f76779` |
| [light/tablet-goals.png](light/tablet-goals.png) | 1920 x 2560 | `d15fd62129fc8eedaf191d85a5837654f64953e7bb28970e8a59563fb6f90d70` |
| [light/tablet-goal-detail.png](light/tablet-goal-detail.png) | 1920 x 2560 | `ec418e8521d8a44da69b64c5da427e72775a9966f95b8644eddc63bd9759aa23` |
| [light/tablet-goal-after-back.png](light/tablet-goal-after-back.png) | 1920 x 2560 | `895e76525722f2cc91ad6d8904d8e3b16ab895f217fee049581d9a3ef4254365` |
| [light/phone-after-density-return.png](light/phone-after-density-return.png) | 1080 x 2424 | `6010b87a89ba0d52fb96483ef54f5f735cff319abd50fb1fd1d33617f866fc86` |
| [light/home-finance-entry-visible.png](light/home-finance-entry-visible.png) | 1080 x 2424 | `e344e0eba3a0b4477d22b4a176935d77f641dc00b692ef78ce64d83ad00b9199` |
| [light/opaque-child-reference.png](light/opaque-child-reference.png) | 1080 x 2424 | `229c15192d444a5bc296c5448154559794a4f41cce72feef2ec29e45540792bd` |
| [light/appearance-after-restart.png](light/appearance-after-restart.png) | 1080 x 2424 | `b34a1a3ada7b3a127909e819b9dd48de6986d3355ec24d1709a45fc9253c68e7` |
| [system/appearance-follow-device.png](system/appearance-follow-device.png) | 1080 x 2424 | `1400b8826719f3f1a3d9c66a5f64f7e406f7f54876ab036a5260058703e675f6` |
