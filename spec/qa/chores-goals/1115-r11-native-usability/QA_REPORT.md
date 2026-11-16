# R11 native usability: first attempt stopped

This run stopped with `RuntimeError: Native control/text not found: Confirm`. Six LIGHT functional cases passed before the lookup failure. Twenty original Android PNGs were retained. The manifest is `completed: false`; this run does not establish a full native regression pass, dark-mode coverage or formal density/privacy-caption/reference closure.

## Build and capture

- App build `1115-FamilyEnvelopes-Journal-r11`, source `f0c888a924df362b0841dd9fc568db6d1e8cc59d`, branch `feature/mobile-foundation`.
- Master-recorded clean APK compilation: 1m10, installation successful, SHA-256 `8D338023B2DD4792C23ABA3ABF1B75517B31E4D8D106308F4C457C733EB1F6F5`. The master verified generated MainActivity contained no temporary BUDisplay/probeDisplay/debug instrumentation before compilation. APK build/bytes are reported from that record; this review independently verifies the PNG bytes below.
- Pixel_10 AVD, Android 17 x86_64, package `com.oxieg3n.betweenus`, Metro 8082. Original size 1080 x 2424, density 420, font scale 1.0. Viewport overrides used one AVD, not separate physical devices.
- [Manifest](capture-manifest.json), [actions](capture-actions.json), [native results](native-check-results.json). Screens were captured through real ADB screencap and pull without altering original PNG bytes. Only fictional information appears.

## Performed checks

The results file records six passed cases: small phone, standard phone and large phone navigation/goal detail/native Back; exact unsaved journal text retention during a live density change; tablet navigation/native Back; and full tablet-to-phone geometry round trip without an app restart. Geometry checks required two successive stable complete samples. Tablet used 1920 x 2560 at density 320, approximately 960 x 1280 dp.

Device restoration separately passed with no errors: original size/density and font scale were restored. This is six functional passes, one failed lookup and one verified-restoration result, not a completed all-theme run.

Native UUID reference verification, 200% text, actual keyboard review/edit/simulated-send and appearance persistence were not reached. No dark originals were captured. The full rerun remains pending and must provide its own evidence; prior failed originals are preserved here.

## Failure evidence and diagnosis limits

The [actual failure image](light/failure-state.png) shows the matching review modal fully on screen, with legible Confirm and Cancel controls. It does not show a clipped or hidden Confirm action. A fresh native XML dump obtained by the master after the failure was independently read during this review: Confirm was `clickable=true`, `enabled=true`, with bounds `[129,1374][951,1503]` inside the phone viewport. That later dump is an ignored local diagnostic, not the failed first snapshot or a committed capture artifact.

The first lookup's exact timing/tree cause is unproven. The observed visible modal and later XML support explicitly waiting for the clickable native Confirm control before tapping; they do not justify calling the app action broken or claiming the first snapshot was valid. The next driver revision adds an existing bounded `wait_visible('Confirm', clickable=True, timeout=10)` before the tap. Runtime/business source remains unchanged; this first failed attempt is not overwritten or relabeled.

## Visual findings

Representative originals were inspected directly: all small-phone screens, standard Home/goals/detail, large Home, retained tablet editor, restored phone and failure modal. The retained editor displays the complete privacy caption and the exact fictional unsaved sentence. The restored phone has its full-width right header action and all four bottom tabs. Home preserves one primary Talk action and readable hierarchy; large phone shows Chores & Goals initially, while standard/small phone require scrolling. Goal content below the fold is scrolling content rather than proof of inaccessible controls.

No overlap or missing bottom navigation was found in those inspected originals. This subset review and the LIGHT-only passes do not close the earlier P2 privacy-caption or full density round-trip gate in both themes. It also does not certify TalkBack speech, physical Android, iOS, hot font-scale draft retention, production identity/privacy or actual money movement. Finance and messages remain simulated memory-only flows.

## Independent file verification

All 20 PNG SHA-256 values and IHDR dimensions were independently recomputed and match the manifest: four 840 x 1680, seven 1080 x 2424, four 1260 x 2730 and five 1920 x 2560. All originals are preserved unchanged.

| Original | Dimensions | SHA-256 |
|---|---|---|
| [light/small-home.png](light/small-home.png) | 840 x 1680 | `e88b6572bf1d71dfc989f50be9638ebdf9b5125b7efa832f2ccc938fd760a83d` |
| [light/small-goals.png](light/small-goals.png) | 840 x 1680 | `060071659644d988e6c3b2f44170cec7ff6a73ccdc0b7ff0f36b724037317641` |
| [light/small-goal-detail.png](light/small-goal-detail.png) | 840 x 1680 | `4f15f89efa4b11b0293704d547d61acc18b9d858166d0514946cb8912317ae50` |
| [light/small-goal-after-back.png](light/small-goal-after-back.png) | 840 x 1680 | `0c486307412988097110cd4650e145cace09c2c5e0bb1ce62744ef1d663cd65f` |
| [light/standard-home.png](light/standard-home.png) | 1080 x 2424 | `f8750e79874c330523b9d83efd218c77c557ff65c2702dc2177e603f9c3e9a9d` |
| [light/standard-goals.png](light/standard-goals.png) | 1080 x 2424 | `28504c1219aa7f37188a1d691d3809bbc916230b4a90911bf684c45738e6a3fc` |
| [light/standard-goal-detail.png](light/standard-goal-detail.png) | 1080 x 2424 | `219c98a88aa2c0c06153fa96f7203f606b69f5b2d6cd5f145545de591f62b4c1` |
| [light/standard-goal-after-back.png](light/standard-goal-after-back.png) | 1080 x 2424 | `abe6f1e9a89054548a7866bbf0ec50746e9aab00e1d00ee97b78a02600b689e6` |
| [light/large-home.png](light/large-home.png) | 1260 x 2730 | `66618269baef280761ff8173dfd1cdc5161513a54eb6256caf21db72d58c1467` |
| [light/large-goals.png](light/large-goals.png) | 1260 x 2730 | `c6a8c806bbb15d4c7c75ffce372f7ef7ef5cdf8e51d3361550e86782a834fb03` |
| [light/large-goal-detail.png](light/large-goal-detail.png) | 1260 x 2730 | `ccb697b54353f7a168c151002c069c59d81ef2df6d93f9afca262b118e3011bc` |
| [light/large-goal-after-back.png](light/large-goal-after-back.png) | 1260 x 2730 | `366e9b1dfe7dc36bc603fd7482246ad4fbbb9a79f588bfd32edcd1abda2efe2b` |
| [light/tablet-draft-retained.png](light/tablet-draft-retained.png) | 1920 x 2560 | `54699a3b205581665d0800bfb49166d4228131a5c026f654717ae737b18621d2` |
| [light/tablet-home.png](light/tablet-home.png) | 1920 x 2560 | `3688e1e4417e84f50400bff9a29b0442ed1063d334824c08d43595e9f01091e3` |
| [light/tablet-goals.png](light/tablet-goals.png) | 1920 x 2560 | `31cfd139f3ce16294a0f9bee9da1b6017b827d33938a0f9a95a6ef764fed6c6e` |
| [light/tablet-goal-detail.png](light/tablet-goal-detail.png) | 1920 x 2560 | `54fd1fd164538b02dc2481ac5d3422bafc763a6abf0c308c2643bd16411dadd7` |
| [light/tablet-goal-after-back.png](light/tablet-goal-after-back.png) | 1920 x 2560 | `e1a4a2ce734021e59ce98c3b46c86d0777cb8bca0f475aa191104c87022cd9ba` |
| [light/phone-after-density-return.png](light/phone-after-density-return.png) | 1080 x 2424 | `b7c3f92cd7225a152d2586630eff2f869073c4acbc8b6a70e0e3e566d5a194c2` |
| [light/home-finance-entry-visible.png](light/home-finance-entry-visible.png) | 1080 x 2424 | `cdb974ceab50541cde3b1724be3302d0f422ccfe555b4e1f930dec3a5ddd0a0c` |
| [light/failure-state.png](light/failure-state.png) | 1080 x 2424 | `e18a6e4c927fc592abbf36960c519102037e5b81c83fd6ac8b75c993ec316bcc` |
