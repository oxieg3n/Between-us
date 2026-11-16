# R11 native usability: second attempt stopped

This attempt stopped with `RuntimeError: Native control/text not found: Chores & Goals` during the 200% font-scale workflow. Seven LIGHT cases passed, including the density round trip and native opaque reference check. Twenty-three original Android PNGs remain preserved. The manifest is `completed: false`; no DARK checks or complete all-theme native pass are claimed.

## Provenance

- Runtime build `1115-FamilyEnvelopes-Journal-r11`, unchanged app source `f0c888a924df362b0841dd9fc568db6d1e8cc59d`; driver/capture HEAD `f07c8351b124d3dd8a778c432a407178009c4082`, branch `feature/mobile-foundation`.
- Installed clean R11 APK SHA-256, as recorded by the master: `8D338023B2DD4792C23ABA3ABF1B75517B31E4D8D106308F4C457C733EB1F6F5`. Temporary native diagnostic probes were removed before this APK build. PNG bytes and dimensions were independently verified by this review; APK build/bytes are reported from the master's record.
- The driver change from the [first R11 attempt](../1115-r11-native-usability/QA_REPORT.md) explicitly waits up to ten seconds for a clickable Confirm control before tapping. No app business/source change was introduced for this rerun.
- Pixel_10, Android 17 x86_64, package `com.oxieg3n.betweenus`, Metro 8082. Original viewport 1080 x 2424, density 420, font scale 1.0. Size/density overrides used one AVD, not separate hardware.
- [Manifest](capture-manifest.json), [actions](capture-actions.json), [native assertions](native-check-results.json). All original PNGs came from actual ADB screencap and pull. No browser substitute, generated image or altered original is used.

## Performed checks and incomplete coverage

Seven cases passed: small, standard and large phone navigation/goal/native Back; exact unsaved journal text across live density change; tablet navigation/Back; full density round trip without restart; and native opaque child references. Tablet/phone geometry required two successive complete stable samples. Device restoration separately verified the original size/density/font scale with no errors.

The real retained editor has the complete privacy caption and exact fictional unsaved sentence. The restored-phone original shows the correct full header and bottom navigation. Native UUID `local-658feee8-2dbc-43b7-bc4b-a0afd90f1209` was checked after saving a fictional journal, changing hidden parent matching configuration and creating a child goal. It is a UUIDv4 and remains fully within the child history viewport; neither the journal words nor hidden configuration appear in that visible record. This runtime trace is not a general privacy proof.

The OS font setting was changed to 200%, followed by a fresh app session. Home and goal screenshots were captured at that setting. The later parent matching confirmation workflow did not complete, so 200% interaction testing is not marked passed. Keyboard/review/edit/simulated-send and appearance persistence were not reached. No dark originals were captured. Formal P2 caption/density/reference closure in both themes remains open pending a complete clean run.

## Failure and visual findings

All 23 originals were individually inspected. The [failure state](light/failure-state.png) is the Open the Door screen at 200% text, with Back, the simulated check-in and an Edit schedule action below the first viewport. It is not Home. Therefore this image does not demonstrate a missing Chores & Goals control on Home. The actions file last records role switch and a Home tap; the exact reason the subsequent flow reached check-ins is unproven. The driver should verify the intended destination and reacquire settled clickable geometry after navigation/scroll, without weakening the actual navigation assertions.

The seven passed cases show readable wrapping, full four-destination phone navigation, full-height tablet rail and restored phone geometry. The 200% Home and goal images preserve readable headings/body and visible bottom labels; lower content requires scrolling. The genuine scrolled Home image frames the full Chores & Goals action and description above navigation. The child UUID reference fits without clipping. No new overlap or missing navigation was found in the captured originals; this does not turn the stopped interaction suite into a pass.

Initial Home discoverability for finance remains polish on small/standard phones because the action is below the first fold. One AVD override, native control bounds and screenshots do not certify physical Android/tablets, iOS, spoken TalkBack, hot font-change unsaved retention or production security. Messages, schedules and financial ledgers remain fictional memory-only simulations; no money moved.

## Independent original verification

All 23 SHA-256 values and PNG IHDR dimensions were independently recomputed and matched the manifest: four 840 x 1680, ten 1080 x 2424, four 1260 x 2730 and five 1920 x 2560. Prior failed runs and these originals are unchanged.

| Original | Dimensions | SHA-256 |
|---|---|---|
| [light/small-home.png](light/small-home.png) | 840 x 1680 | `15b1b63e47748d7d21ed86780f5a61c12519237c3cdd22dd8db6e616db521704` |
| [light/small-goals.png](light/small-goals.png) | 840 x 1680 | `f9880a12ce4671f54c7db6384ab045ab6f54068c07fa190de17f5f27d53dea05` |
| [light/small-goal-detail.png](light/small-goal-detail.png) | 840 x 1680 | `1d7c47e15571940b847d08b41d7969b01c34f8abb286b09359295b5f6fb07101` |
| [light/small-goal-after-back.png](light/small-goal-after-back.png) | 840 x 1680 | `03ac5ae84417edcfff0242ece6bccef53f6e854681070bb04701f1b9807641d2` |
| [light/standard-home.png](light/standard-home.png) | 1080 x 2424 | `d1144da71fb212a2516444edb465fec5e6cf993bdfd2b3a68cfa7952cf6650f0` |
| [light/standard-goals.png](light/standard-goals.png) | 1080 x 2424 | `0fd397559197a10a37c4f96455cb46d27e4ee34a55def8b1c5a8a277b82ba799` |
| [light/standard-goal-detail.png](light/standard-goal-detail.png) | 1080 x 2424 | `ad8776217f0738d3d7785a2e20087b6e18b2bf377a47f43891badb87971fa079` |
| [light/standard-goal-after-back.png](light/standard-goal-after-back.png) | 1080 x 2424 | `7446bcd0f0f5edef5b175f5ad97b79d11a8bfd737e0e6f8d4822725053b10ecd` |
| [light/large-home.png](light/large-home.png) | 1260 x 2730 | `9d025367f99015dd84c84291436e65951fcf289f7389661e8454932470b54a45` |
| [light/large-goals.png](light/large-goals.png) | 1260 x 2730 | `fe0632b592fd6f55a742d6780e75605fb76930f4a3dcc10e093135f38223f39f` |
| [light/large-goal-detail.png](light/large-goal-detail.png) | 1260 x 2730 | `e83338375da613f8a5093c28d456caee49139f6ad20e86d29766300888990b62` |
| [light/large-goal-after-back.png](light/large-goal-after-back.png) | 1260 x 2730 | `7004a7a6f3bcf78661f0bf6928ac81900b74c6492452ba609bba4cba22338c7f` |
| [light/tablet-draft-retained.png](light/tablet-draft-retained.png) | 1920 x 2560 | `ca6d4b205dc0e82d3b52209bb7805185568c0b51fc5996957e1e80baa45e3789` |
| [light/tablet-home.png](light/tablet-home.png) | 1920 x 2560 | `423750af6f75b72a35113b4360385442f68da73acadb5179b9f275ae48b297a1` |
| [light/tablet-goals.png](light/tablet-goals.png) | 1920 x 2560 | `34c829f64c3d25e7fb13bc9bea93cb35447b666b9e4a07dd6fcad3fd62207de3` |
| [light/tablet-goal-detail.png](light/tablet-goal-detail.png) | 1920 x 2560 | `ad65c0d51169cae8e638d13250ef66ada4403922120526207d538242d5425814` |
| [light/tablet-goal-after-back.png](light/tablet-goal-after-back.png) | 1920 x 2560 | `e4552b61c798b735e98eed586888521c761ec8d20359a0c312435fee47ad22bb` |
| [light/phone-after-density-return.png](light/phone-after-density-return.png) | 1080 x 2424 | `013bd3533def8a25dfe03167cba949ab7c0c70e234ca555dd3e87c9f295603ac` |
| [light/home-finance-entry-visible.png](light/home-finance-entry-visible.png) | 1080 x 2424 | `16e2268c629c397425daa9c18c5b906f932fe697b3f96c7c0e7e2a517072556d` |
| [light/opaque-child-reference.png](light/opaque-child-reference.png) | 1080 x 2424 | `e575a8164e5266b29c40641d206bb92160f185a776e22395428cd0bbdf007530` |
| [light/font-200-home.png](light/font-200-home.png) | 1080 x 2424 | `bf02491675e2e60275c2c90bbf49ab0dbe1b260c1750656e4561dea83fa6630f` |
| [light/font-200-goal.png](light/font-200-goal.png) | 1080 x 2424 | `e0c26e9d3658eba3d7a5a0232294936b21ea733cf847c2f8cd4a7d1ca3ead1c1` |
| [light/failure-state.png](light/failure-state.png) | 1080 x 2424 | `69a473b8ac01615bb2da651bab33048cf993827953f2fb689dfba4f2a990626d` |
