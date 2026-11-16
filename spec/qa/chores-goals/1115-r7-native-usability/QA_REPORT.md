# Native usability QA - r7

Status: **the recorded functional cases passed; visual QA has an open P2 defect**. The completed run contains 56 actual Android PNGs. Its manifest records `completed: true`, `error: null`. The result JSON records **17 passed cases and one verified device-restoration result**, with no failed result. Passing those checks does not close the clipped privacy label observed in the retained tablet editor.

## Provenance and review method

| Item | Recorded value |
| --- | --- |
| Build | `1115-FamilyEnvelopes-Journal-r7` |
| Source HEAD | `8c89c899ada444dcb4a543a377f780e9b61db0ed` |
| Branch / application | `feature/mobile-foundation` / `com.oxieg3n.betweenus` |
| Environment | Pixel_10 AVD, Android 17, `emulator-5554`, Metro port 8082 |
| Original device settings | 1080 x 2424 physical pixels, density 420, `font_scale` 1.0 |
| Capture | Actual ADB screencap/pull by the serialized master operator; original PNG bytes |
| Evidence | [Capture manifest](capture-manifest.json), [actions](capture-actions.json), [native results](native-check-results.json) |

The independent reviewer recalculated SHA-256 and PNG IHDR dimensions for all 56 files: **56/56 matched the manifest**. There are 27 light files, 28 dark files and one Follow Device file. The reviewer visually inspected 20 representative originals, including both retained-editor images, representative small/standard/large/tablet layouts, 200% text/modal actions, actual keyboards, edited review, simulated conversation and appearance settings. The integrity table identifies these inspected files; file verification is not presented as visual inspection of all 56. No screenshot was changed, cropped or rescaled. This reviewer ran no ADB, Git, app or device-setting operations.

## Recorded native results

| Case group | Actual result and scope |
| --- | --- |
| Small, standard, large and tablet responsiveness | Eight passed cases: four viewport classes in each theme. All four named navigation controls had complete native bounds; opening a goal and Android Back returned to its overview. |
| Live density and unsaved draft | Two passed cases. Exact typed fictional text remained in the native editor across density change; the harness checked the native tree for the duplicate-linking warning and found none. The editor was then saved. This proves the scoped density fix's functional behavior, while its privacy-label defect remains below. |
| 200% system font scale | Two passed cases. Home navigation remained reachable, a goal opened/returned with Back, and a long matching confirmation scrolled to full Confirm and Cancel bounds. Cancel was actually tapped without saving the rule. Confirm reachability was checked; this case did not activate Confirm. |
| Native journal editing | Two passed cases. Title/body were typed through EditText, saved, revisited and compared with the exact fictional text. Actual keyboard-open screenshots were captured. |
| Keyboard, review and simulation | Two passed cases. Review was tapped with the IME open, the message was edited and reviewed again, an explicit simulated send was performed and native Back returned to Review. No message was delivered. |
| Appearance persistence | One passed case. Night Harbor remained selected after force-stop/relaunch without selecting it again. The app was then returned to Follow Device through its actual settings. |
| Device restoration | Verified restored with zero errors. The final physical-size/override output, density output and font setting matched their original values. |

### Viewport matrix

| Class | Original pixels | Android density | Approximate dp | Themes |
| --- | --- | --- | --- | --- |
| Small | 840 x 1680 | 420 | 320 x 640 | Light and dark |
| Standard | 1080 x 2424 | 420 | 411 x 923 | Light and dark |
| Large | 1260 x 2730 | 420 | 480 x 1040 | Light and dark |
| Tablet | 1920 x 2560 | 320 | 960 x 1280 | Light and dark |

These are sequential `wm` viewport/density overrides on **one AVD**, not four devices, tablet hardware, or manufacturer/IME compatibility testing. The tablet images show a navigation rail while phone images retain labeled bottom navigation. New-screen tablet Home and Goals have readable long labels; the retained editor's privacy row is a distinct failure rather than a general lack of tablet space.

### IME and control geometry

The result JSON records the same native pixel bounds in each theme at 1080 x 2424:

| Control / boundary | Bounds `[left, top, right, bottom]` or Y coordinate | Interpretation |
| --- | --- | --- |
| Visible IME top | Y = 1541 | Actual software keyboard reported by Android window state |
| Message draft | `[53, 1098, 767, 1298]` | Entire draft control is above the keyboard |
| Review | `[793, 1168, 1028, 1297]` | Entire action is above the IME; its lower edge has 244 px clearance |
| 200% modal Confirm | `[129, 1625, 951, 1787]` | Complete on-screen bounds after scrolling |
| 200% modal Cancel | `[129, 1840, 951, 2002]` | Complete on-screen bounds; actual cancellation followed |

Both keyboard screenshots visibly preserve the composer, Review and navigation above the keyboard. The keyboard itself remains the operating system's light Gboard surface in Night Harbor; it is outside the app's theme. The journal editor scrolls while the IME is open; Save/revisit was exercised after keyboard dismissal. The tested bounds and actions support this specific workflow, not every possible message length or keyboard.

## Visual findings

**OPEN P2 - privacy text clips after a live density transition.** Both [light retained editor](light/tablet-draft-retained.png) and [dark retained editor](dark/tablet-draft-retained.png) display only `Just for you` followed by `nothing`; the expected ending `is shared` is absent despite ample horizontal room. The last visible descender also appears clipped. The exact draft and Save control remain intact. This reduces the clarity of the privacy explanation; it does not demonstrate a disclosure or financial permission failure.

A stale native intrinsic text/span layout is a plausible explanation, not a proven root cause. The installed RN measurement cache already includes pixel scale in its key. The planned correction is limited to the stateless privacy label: constrain it with `flexShrink: 1` and recreate that label when density changes. It must preserve the editor, inputs and draft state and must not disable text scaling, remount the form or suppress linking warnings. The master will run a targeted r8 live-density recapture; **no r8 result or fix is claimed in this r7 report**.

The representative small Home and 200% Home preserve the primary action and four text-labeled destinations. Small Goals has its primary action partly below the initial viewport; the actual run scrolls to open a goal and returns using Back, so the partial first screenshot is not proof that the action is unreachable. Long modal text wraps and the action screenshots expose complete Confirm/Cancel controls in both themes. The edited review shows the recipient, exact separate message, response preference and explicit Simulate send; the simulated thread labels the resulting message as simulated. Appearance clearly distinguishes Selected and Follow Device. No additional blocking defect was found in these representative views; the known P2 remains open.

## Validation limits and follow-up

- The 200% tests set Android font scale, then start a fresh, settled app session. They establish cold-session scaled usability, not preservation of an unsaved form through a hot font-scale change. `fontScale` was intentionally not added to handled Activity configuration flags. Restoration to 1.0 is followed by a fresh test session; hot restoration is not certified.
- Native tree bounds, clicks and text comparisons are actual interaction evidence, but they do not certify spoken TalkBack order/announcements, switch access, focus visibility, dynamic contrast or all touch-target states. No spoken TalkBack or VoiceOver pass is claimed.
- No physical Android device, alternate IME, foldable/multi-display hardware, iOS/macOS build or real-device accessibility test was performed here.
- This run does not benchmark native-model performance or adversarial safety, test production authentication, or turn simulated messages/finance into real delivery/transfers.
- Close P2 only after the targeted r8 screenshots show the full privacy sentence in both themes and exact unsaved text survives the same density transition. Preserve these r7 originals and results as defect provenance.

## Original PNG integrity ledger

Every row below passed an independently calculated SHA-256 and original-dimension check. `Yes` marks a representative image visually inspected by this reviewer; remaining rows were file-verified and their functional context was read from the native result/action JSON.

| Original | Pixels | Visually inspected | SHA-256 |
| --- | --- | --- | --- |
| [light/small-home.png](light/small-home.png) | 840 x 1680 | Yes | `e485e607fd2e9e942ee4850323c515a6c2b5bcf1f4d56be552fba74f4a2e38c6` |
| [light/small-goals.png](light/small-goals.png) | 840 x 1680 | No | `1bd7ee7e9061cced70e87630b0c910c8a5430c431475e8e21b8147af01eea4bc` |
| [light/small-goal-detail.png](light/small-goal-detail.png) | 840 x 1680 | No | `a16b29e87ed71b29fb07f47c38a3a46f531de1c0ab47066fdf2e0088e71b487a` |
| [light/small-goal-after-back.png](light/small-goal-after-back.png) | 840 x 1680 | No | `ff4c3ae9ffb6a99bc3ddcb2502565bf058185418759f151066ecc02907afbfc0` |
| [light/standard-home.png](light/standard-home.png) | 1080 x 2424 | No | `2315faaeed4a877d155ee929fba4a06d1edf87e2acfe335ee32011295a273f95` |
| [light/standard-goals.png](light/standard-goals.png) | 1080 x 2424 | No | `13bff1eaa740751f6706feae955134c8e910f47de77295a7a65520c99ce77bee` |
| [light/standard-goal-detail.png](light/standard-goal-detail.png) | 1080 x 2424 | No | `3790a8a34f1ec9469383d87bccf7ea03960c72aee193d3fb9241cb80f0a75563` |
| [light/standard-goal-after-back.png](light/standard-goal-after-back.png) | 1080 x 2424 | No | `8277132e9da95c5878517ccb9ccde3b194ecd8bd2f53ab4a2831a8cab46b520f` |
| [light/large-home.png](light/large-home.png) | 1260 x 2730 | No | `d96182d088578fc4e7e660eca9f2c5f0739d561e7b491973af273e1cb983b2fb` |
| [light/large-goals.png](light/large-goals.png) | 1260 x 2730 | Yes | `a8b3ce9330b6bdddf0f06d83495256df18da143b5423b4f893138aaee66c0d48` |
| [light/large-goal-detail.png](light/large-goal-detail.png) | 1260 x 2730 | No | `f9249a68e0edb721ed7527a043b856097ec7ff58f5678dcac6d5dc96610efea2` |
| [light/large-goal-after-back.png](light/large-goal-after-back.png) | 1260 x 2730 | No | `7ccc20a8faa7c1c3b9fcdeaa30bb5a2db0a888445e3b26bb6e6ebc4e7a475c1b` |
| [light/tablet-draft-retained.png](light/tablet-draft-retained.png) | 1920 x 2560 | Yes | `97d8d3bed4fa7547338cb25cabca5bb1f013163e736cfb24f1e7625fe3da5236` |
| [light/tablet-home.png](light/tablet-home.png) | 1920 x 2560 | Yes | `02dfe2d85a1b13188dd91a5f0ce110426addbc1f0654b64e519c873331c60a04` |
| [light/tablet-goals.png](light/tablet-goals.png) | 1920 x 2560 | Yes | `7a5d4e342ff823e23093d0b2b64d142824057128e4280acafb65f642297ac04f` |
| [light/tablet-goal-detail.png](light/tablet-goal-detail.png) | 1920 x 2560 | No | `0997600eaad7962e3927bebd88506e6adbaa65518e03ee23506df1af8b443cd2` |
| [light/tablet-goal-after-back.png](light/tablet-goal-after-back.png) | 1920 x 2560 | No | `d94ca0bedc24cbb805dd92882fdd51e125606c1054dd4d897ce4e806900fff90` |
| [light/font-200-home.png](light/font-200-home.png) | 1080 x 2424 | Yes | `e3128cab3b689302233a477ae6cd5ce6635ad186617146a2d45a58536a10aaa7` |
| [light/font-200-goal.png](light/font-200-goal.png) | 1080 x 2424 | No | `02254b907de0bf4c89bbb372c0ca48e2f8f4ce11eacfb8c916620aa2600b4787` |
| [light/font-200-confirmation-top.png](light/font-200-confirmation-top.png) | 1080 x 2424 | No | `43ba8d483fdaca3ad0ae2fe539d7648bc6576fae64044d51f1da8af6f1d2056e` |
| [light/font-200-confirmation-action.png](light/font-200-confirmation-action.png) | 1080 x 2424 | Yes | `43ba8d483fdaca3ad0ae2fe539d7648bc6576fae64044d51f1da8af6f1d2056e` |
| [light/font-200-confirmation-cancel.png](light/font-200-confirmation-cancel.png) | 1080 x 2424 | No | `a9feff2304697e90ac500aecb0452ea3008c89325f7aad88769cc9ba101cfd7e` |
| [light/journal-keyboard.png](light/journal-keyboard.png) | 1080 x 2424 | Yes | `fb239274f67b8f38429f9b5cd8666e3de70f6e42e3e23f1a87926f65c2bf542f` |
| [light/conversation-keyboard.png](light/conversation-keyboard.png) | 1080 x 2424 | Yes | `2204979c14e1bec109846c14442efa89829082e000132c5b721ba8d892998f70` |
| [light/native-message-review.png](light/native-message-review.png) | 1080 x 2424 | No | `a08362d2daf877c5ee80c3ce8157211368a6063c7109dd1eee7bf9df80ac7205` |
| [light/native-edited-message-review.png](light/native-edited-message-review.png) | 1080 x 2424 | Yes | `a85a73f97e9a517a98a7439834682ff9d473725b401584d81fb0484d3897b0c3` |
| [light/native-simulated-conversation.png](light/native-simulated-conversation.png) | 1080 x 2424 | No | `6307a2459b01a35cb8ee17a7e37f88b67fbffdeaf6decba99fc0e86980c65d80` |
| [dark/small-home.png](dark/small-home.png) | 840 x 1680 | No | `3b7013091e984bd4c298736a0e6cb3aa64eeeaae6844a716e672b92e3612c958` |
| [dark/small-goals.png](dark/small-goals.png) | 840 x 1680 | Yes | `30fc2ca3ded57d987bb970fd76a1d0aa88dfe4359231a4971e73e99a8481d4c5` |
| [dark/small-goal-detail.png](dark/small-goal-detail.png) | 840 x 1680 | No | `4fb6117b49bb1a1d7a16f4f3f66666f409fe4eaf296e8c0f6f7ef2ffa052f9be` |
| [dark/small-goal-after-back.png](dark/small-goal-after-back.png) | 840 x 1680 | No | `07c79ed275b76632aedc4327ee92c610b1e4fc1d85d1051348cd305593ae8b8a` |
| [dark/standard-home.png](dark/standard-home.png) | 1080 x 2424 | Yes | `75efcdaf308cae76669c43bcbc127c65b217088b992e9296cb3b8cbac7f933c2` |
| [dark/standard-goals.png](dark/standard-goals.png) | 1080 x 2424 | No | `4d1bb9109930bbb3aa86f6a0089b904ed952a349d5fb49123474a32391f462c6` |
| [dark/standard-goal-detail.png](dark/standard-goal-detail.png) | 1080 x 2424 | No | `219c6f07c296f8555690bd841dcc77fde8079f3ab6e9f18460fba414adf2e9f5` |
| [dark/standard-goal-after-back.png](dark/standard-goal-after-back.png) | 1080 x 2424 | No | `a2b49346b2d6fde8d8df3f8c4835948e3728a6b3d94a1164dbb586722820b8c2` |
| [dark/large-home.png](dark/large-home.png) | 1260 x 2730 | No | `4b9bd21ae7d2b13f50f192c8bb56860ebc86086b512052799c2f181152adf419` |
| [dark/large-goals.png](dark/large-goals.png) | 1260 x 2730 | No | `d4f830ec65b4295b952e60ed88f6b178ac2c6d6a5c95a0a9ab2149e28a6226e5` |
| [dark/large-goal-detail.png](dark/large-goal-detail.png) | 1260 x 2730 | No | `356e3ab33b7524aa1b8ef9c981e94a71f2c4dd81e59f634f4e277cfc0cc647a9` |
| [dark/large-goal-after-back.png](dark/large-goal-after-back.png) | 1260 x 2730 | No | `9a35fe2581bdde988da34e001900c0be16675c50d1d9374758de7b289eaf950e` |
| [dark/tablet-draft-retained.png](dark/tablet-draft-retained.png) | 1920 x 2560 | Yes | `02795d87eff8f46307ef2a3c73b1ea8114c293cbb7ce58334af9a68cd6929909` |
| [dark/tablet-home.png](dark/tablet-home.png) | 1920 x 2560 | No | `fe7cda81f47df44b57b8761bd761bbe9b293aeb9b1ab6996d75bca397f5d6807` |
| [dark/tablet-goals.png](dark/tablet-goals.png) | 1920 x 2560 | Yes | `cfdb5cac25bb5ae6d52b2f8d67179638d5805d095fb883032e3c55a25877cf2f` |
| [dark/tablet-goal-detail.png](dark/tablet-goal-detail.png) | 1920 x 2560 | No | `6d2a602e8efe315816ea6ce6c3e628f29d045b13188953e032a24815e18975bc` |
| [dark/tablet-goal-after-back.png](dark/tablet-goal-after-back.png) | 1920 x 2560 | No | `8f8d35815c8138c1619af3691dcb7796b68187b646021f51652e1fc6f50877e4` |
| [dark/font-200-home.png](dark/font-200-home.png) | 1080 x 2424 | Yes | `8789b10160e3ff76e2a69b4247fdfc0a2577a59c67dfb4c805a73e84043fdb3f` |
| [dark/font-200-goal.png](dark/font-200-goal.png) | 1080 x 2424 | No | `e04706925942a336eea1d89ef5fe9d3fd91d1c1b7f11789a4c224360630204ab` |
| [dark/font-200-confirmation-top.png](dark/font-200-confirmation-top.png) | 1080 x 2424 | No | `ee749895681810304ffcd163f75d75242e492aeb9839ea169de9fcca0cfde80c` |
| [dark/font-200-confirmation-action.png](dark/font-200-confirmation-action.png) | 1080 x 2424 | No | `ee749895681810304ffcd163f75d75242e492aeb9839ea169de9fcca0cfde80c` |
| [dark/font-200-confirmation-cancel.png](dark/font-200-confirmation-cancel.png) | 1080 x 2424 | Yes | `ee749895681810304ffcd163f75d75242e492aeb9839ea169de9fcca0cfde80c` |
| [dark/journal-keyboard.png](dark/journal-keyboard.png) | 1080 x 2424 | No | `52d73e41d191d613e67bf0bde98192ba8774ac010870236c4a225c4bbbc1aad5` |
| [dark/conversation-keyboard.png](dark/conversation-keyboard.png) | 1080 x 2424 | Yes | `129ebfd677e5c12339ab28d78874ef78973979173c12e98bbe99521354e490fa` |
| [dark/native-message-review.png](dark/native-message-review.png) | 1080 x 2424 | No | `d3157373ff7bcf42f77961952ae99529937b4379bc5e527f7bf818fac28f5754` |
| [dark/native-edited-message-review.png](dark/native-edited-message-review.png) | 1080 x 2424 | No | `df535763cdc603a28cfe69af728f8cdd2b0e067643fc4b995d95593926b30715` |
| [dark/native-simulated-conversation.png](dark/native-simulated-conversation.png) | 1080 x 2424 | Yes | `42521d4100d5248a03c4ea21abea1749b5581409ed3f737e8b367e3a54930dc5` |
| [dark/appearance-after-restart.png](dark/appearance-after-restart.png) | 1080 x 2424 | Yes | `28f13f0fdc0aa3ddf834fa6bcaf209b839565ca684be5d144896474adb14e7b3` |
| [system/appearance-follow-device.png](system/appearance-follow-device.png) | 1080 x 2424 | Yes | `b9e1c5c0eac2774045e4c1af3668cb4e9ec4238e9e6e9d56de922db93c48bf75` |
