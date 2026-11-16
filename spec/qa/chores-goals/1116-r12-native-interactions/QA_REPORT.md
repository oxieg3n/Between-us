# R12 native journal, keyboard and review: pass

This focused native run completed successfully in Safe Harbor and Night Harbor. Five functional cases passed: journal editing and keyboard/review in each theme, plus appearance persistence. Original size/density/font settings were verified restored without errors. The final manifest is `completed: true`, `error: null`. All 12 original Android screenshots were individually inspected and independently hash/dimension verified.

## Build and capture provenance

- Build `1115-FamilyEnvelopes-Journal-r12`; source/driver `8607573e37dadd66ede3bb368389e0a2531ef6d8`; branch `feature/mobile-foundation`.
- Master-recorded installed APK SHA-256 `34716578ABD1C9DCB9C255C9993E66F3B00BB532B29AC7DE953095302C8FB6E9`. APK build/installation/hash are attributed to that record; this reviewer independently verified the PNG bytes below.
- Pixel_10 AVD, Android 17 x86_64, serial emulator-5554, package `com.oxieg3n.betweenus`, Metro 8082. Native viewport 1080 x 2424, density 420, font scale 1.0. The master recorded guest Google SwiftShader for this session; no physical-device equivalence or graphics-root-cause claim follows from that.
- [Final manifest](capture-manifest.json), [actual actions](capture-actions.json), [native assertions](native-check-results.json). Originals are actual ADB screencap/pull PNGs, preserved without editing. Earlier failed native attempts remain separate evidence.

## Verified interactions

| Case | Actual work | Result |
|---|---|---|
| LIGHT journal editing | Typed fictional title/body through native EditText with IME open, hid keyboard, saved, reopened the entry and asserted exact body text | Passed |
| DARK journal editing | Same real journal save/revisit and exact text assertion in Night Harbor | Passed |
| LIGHT keyboard and review | Typed a separate message, tapped Review while IME stayed open, edited/reviewed again, simulated Send, then used Android Back to return to Review | Passed |
| DARK keyboard and review | Same native message/IME/review/edit/simulated-send/Back flow in Night Harbor | Passed |
| Appearance persistence | Night Harbor selection survived force-stop/relaunch; then Follow device selected through Settings and rendered the device light theme | Passed |
| Device restoration | Original size/density/font checked after run, no errors | Verified restored |

This is five functional passes plus one restoration result. The journal tests used the fictional child demo author in both themes; this run does not claim parent journal native coverage. Saving was performed after hiding the IME; the screenshots do not claim Save was visible above the keyboard.

Native window data placed the visible IME top at y=1541 in both themes. Complete Message draft bounds `[53,1098,767,1298]` and Review bounds `[793,1168,1028,1297]` were verified above it. The actual Review tap occurred without first dismissing the IME. The later review screenshots show the selected recipient Alex, separately composed text and the explicit no-journal-attachment notice. Edited review adds "Edited before review."; the simulated thread contains exactly that edited message. Android Back reaching Review was asserted by the driver, rather than inferred from a screenshot.

## Visual and privacy findings

All 12 originals render coherently at full phone width. The native keyboard leaves the draft, Review and four navigation labels visible in both themes. The journal writing surface and message controls use Night Harbor correctly. The light-colored Gboard shown while the app is dark is OS-owned keyboard appearance, not a missed app theme token. Review, edited text and simulated message bubbles wrap legibly; no overlapping controls, tiled rendering artifacts or horizontally clipped message text were found.

The journal screenshot is scrolled to its writing fields, so privacy-heading content above the viewport is not a complete caption-framing check. The message thread is also scrolled to the composer/latest text. Some lower review content is near the scrolling viewport edge, but the actual edit and Send actions completed. No new functional layout defect was observed. Appearance labels and all navigation destinations fit; Follow device changes the visible app theme immediately.

The only entry/message content is explicitly fictional test text. The message uses its own sentence, distinct from the journal body; no journal text appears in the reviewed message or simulated bubble. Sam/Alex are fictional fixtures. No credentials, real financial information or personal data were found in the originals. Simulation labels remain visible. This is interface evidence, not proof against a malicious client or process-memory inspection.

## Limits

This phase covers normal 100% font on one phone AVD, not current tablet/density, 200% text, spoken TalkBack, physical Android or iOS testing. Blocking has its own [R12 native report](../1116-r12-bidirectional-blocks/QA_REPORT.md). Full financial/model flows and the complete automated regression gate require their own results. No real message or notification was delivered; no money moved. Journals/drafts/messages remain memory-only. Production authentication, consent, storage and authorization remain release gates.

This reviewer inspected evidence and wrote this report only, with no ADB, source, package, Git or original-image modifications.

## Independent original verification

All 12 PNG SHA-256 values and IHDR dimensions were independently recomputed and match the manifest. Every image is 1080 x 2424: five LIGHT interaction originals, six DARK originals including appearance persistence, and one Follow device original. Original bytes are unchanged.

| Original | Dimensions | SHA-256 |
|---|---|---|
| [light/journal-keyboard.png](light/journal-keyboard.png) | 1080 x 2424 | `d3b0d2efc94858b7650affe5f309b943438a8641216977fbafc271fdfa62bd53` |
| [light/conversation-keyboard.png](light/conversation-keyboard.png) | 1080 x 2424 | `c64ba8552cb463b30ff199d190fd0dbd11ee73291484aa6d9d54e7634a302582` |
| [light/native-message-review.png](light/native-message-review.png) | 1080 x 2424 | `6c00a58764b44802605442c2a9a3416c32a974a8de5ccfbcddb2c55586e98300` |
| [light/native-edited-message-review.png](light/native-edited-message-review.png) | 1080 x 2424 | `1dec45193f1c0a3c7d01a0ade72eea187574fe3c2fa2b7e039a796d51b2209fd` |
| [light/native-simulated-conversation.png](light/native-simulated-conversation.png) | 1080 x 2424 | `68f96bce08417624ae011e8e47ac801195f4e254967ee6d68aaa48081fa5b78c` |
| [dark/journal-keyboard.png](dark/journal-keyboard.png) | 1080 x 2424 | `4de22caa7b435d61ab07c63443f6d93b00e05202679db8d1ac831106c81479b3` |
| [dark/conversation-keyboard.png](dark/conversation-keyboard.png) | 1080 x 2424 | `bd62b035f6af55cf8f3e4a68a1c3cc2c00c08e5c1fb37632c882ad7c3ca51e93` |
| [dark/native-message-review.png](dark/native-message-review.png) | 1080 x 2424 | `ff5046897c6c107d3ba87f5642670af6610ec96164b6358ae9fa984ee5753ca4` |
| [dark/native-edited-message-review.png](dark/native-edited-message-review.png) | 1080 x 2424 | `a50cca3ab50b7e2d09bc038533f68ddf02d6af73d406f1b2a8de1223ee5c343d` |
| [dark/native-simulated-conversation.png](dark/native-simulated-conversation.png) | 1080 x 2424 | `4d17c2aa909ea8930c3549af8213594ef2a6f932efee2810f582cbc65981abf2` |
| [dark/appearance-after-restart.png](dark/appearance-after-restart.png) | 1080 x 2424 | `413c0f421c366ad9840bff8c0898f2467134b7ee2ac6ece91b20d6762dcce2d4` |
| [system/appearance-follow-device.png](system/appearance-follow-device.png) | 1080 x 2424 | `3bac667643dfadacd1bddaef5ef7fa9f442aad1b3f93f0238486842f6a775d73` |
