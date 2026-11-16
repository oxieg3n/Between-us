# R11 large-text third attempt: light passed, dark startup failed

The LIGHT 200% case passed, including native navigation, readable goal content, complete Confirm/Cancel bounds and cancellation without saving the matching rule. The run then stopped before DARK build verification with `RuntimeError: Native control/text not found: Build 1115-FamilyEnvelopes-Journal-r11`. The manifest is `completed: false`; this is one passed functional case, one failure and verified device restoration, not a both-theme pass.

## Provenance and performed work

Runtime `1115-FamilyEnvelopes-Journal-r11`, app source `f0c888a924df362b0841dd9fc568db6d1e8cc59d`, remains unchanged. Master-recorded installed clean APK SHA-256: `8D338023B2DD4792C23ABA3ABF1B75517B31E4D8D106308F4C457C733EB1F6F5`. Driver/capture HEAD: `4442c4858d79ed07ca0ce776aeb6ab6b0b0231f5`, branch `feature/mobile-foundation`. Pixel_10, Android 17 x86_64, original 1080 x 2424, density 420, font scale 1.0. This reviewer independently verified original PNG bytes, not APK bytes/build output.

[Manifest](capture-manifest.json), [actions](capture-actions.json), [results](native-check-results.json). The driver stopped the app before changing the OS font setting, then cold-launched a settled test session. This avoids claiming live font-change unsaved-draft retention. Fresh hierarchy snapshots are used; retryable snapshot unavailability is retried only inside bounded readiness/transition waits. No app business or navigation assertion was suppressed.

The LIGHT 200% Home and goal originals show readable wrapping and all four phone navigation labels. The long matching modal shows full text and full Confirm `[129,1625,951,1787]` and Cancel `[129,1840,951,2002]` actions inside the 1080 x 2424 viewport. The three modal originals have the same framing: the actions were already reachable there; their fixture names/descriptions do not prove scrolling was necessary. Actual Cancel completed and no matching setting was saved. Results record original size/density/font restoration with no errors.

## Significant observed rendering failure

All six originals were individually inspected. The [DARK-labelled failure original](dark/failure-state.png) is not a valid dark Settings capture. It contains repeated horizontal/tiled fragments of a LIGHT Home screen across the upper viewport, with part of the previous LIGHT large-text confirmation modal still visible below. A second direct inspection of the original file showed the same corruption. A separate structural PNG check found every chunk CRC valid, the IDAT zlib stream fully decompressible (10,474,104 bytes), and no trailing bytes; this is not an obvious truncated or CRC-broken file. Its original SHA-256 matches the capture manifest, so the report preserves the defective evidence rather than replacing or hiding it.

This is visible rendering corruption requiring investigation. Neither its root cause nor whether it originates in the emulator graphics stack, native lifecycle/rendering, capture path or application is established by these files. A missing Build lookup alone must not be treated as the whole finding. The actions record an earlier Dark mode selection, then another cold startup and Settings tap; they do not prove the failed viewport rendered those actions correctly. No successful DARK 200% case or screenshot is asserted.

The prior full-run attempts and this run remain separate historical evidence. Formal both-theme caption/density/reference closure, interaction regression and final automated regression remain pending. One AVD and PNG/control evidence do not certify physical Android/tablets, iOS, spoken TalkBack or production security. No real finance transfer or real delivery occurred. This reviewer made no app source, package, Git or ADB changes.

## Independent original verification

All six original PNGs are 1080 x 2424. SHA-256 and IHDR dimensions were independently recomputed and match the manifest. Five are LIGHT 200% screenshots; the sixth is a DARK-labelled failure state whose actual pixels are corrupted LIGHT content. No original bytes were altered.

| Original | Dimensions | SHA-256 |
|---|---|---|
| [light/font-200-home.png](light/font-200-home.png) | 1080 x 2424 | `85583286c224792382bb0c6b677fd082e5d9dbc8a729aa7672ad540aec2cd426` |
| [light/font-200-goal.png](light/font-200-goal.png) | 1080 x 2424 | `e9db31b84de8f5009d7b3659643dd8ba9b501e6bd2bd8cf4925fb77ae53bc11e` |
| [light/font-200-confirmation-top.png](light/font-200-confirmation-top.png) | 1080 x 2424 | `1b1ef85d250034537845bc9968a9aba1846f37c3876c836f1c27d2c6ba2e4c47` |
| [light/font-200-confirmation-action.png](light/font-200-confirmation-action.png) | 1080 x 2424 | `1b1ef85d250034537845bc9968a9aba1846f37c3876c836f1c27d2c6ba2e4c47` |
| [light/font-200-confirmation-cancel.png](light/font-200-confirmation-cancel.png) | 1080 x 2424 | `1b1ef85d250034537845bc9968a9aba1846f37c3876c836f1c27d2c6ba2e4c47` |
| [dark/failure-state.png](dark/failure-state.png) | 1080 x 2424 | `6253ae0ef89f862d79da9cd31727b663429c4afe411a8d4f011a162512abf5a5` |
