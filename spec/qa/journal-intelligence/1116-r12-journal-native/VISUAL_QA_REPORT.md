# R12 native Intelligent Journal: visual pass in both themes

The real Android journal workflow completed in Safe Harbor and Night Harbor with accepted `on-device-model` output in each theme. All 12 original PNGs were individually inspected and independently hash/dimension verified. Both the journal projection and full-run manifest are `completed: true`, `error: null`. Each flow ends on Review after deliberate recipient selection; no Send was activated.

## Provenance

- Build `1115-FamilyEnvelopes-Journal-r12`; app/driver source `8607573e37dadd66ede3bb368389e0a2531ef6d8`, branch `feature/mobile-foundation`, canonical root `D:\projects\BetweenUs`.
- The full manifest records clean tracked source (`tracked_source_dirty: false`), with empty-diff SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Master-recorded installed APK SHA-256: `34716578ABD1C9DCB9C255C9993E66F3B00BB532B29AC7DE953095302C8FB6E9`. APK build/hash/installation are attributed to that record; original PNG verification is independent.
- Pixel_10 AVD, Android 17 x86_64, serial emulator-5554, package `com.oxieg3n.betweenus`, Metro 8082, viewport 1080 x 2424, density 420, normal font scale 1.0. Guest SwiftShader was recorded by the master. This is one emulator, not a physical-device result or proof of an earlier graphics fault's cause.
- [Journal manifest](capture-manifest.json), [full-run manifest](../../chores-goals/1116-r12-journal-native/capture-manifest.json), [actual actions](../../chores-goals/1116-r12-journal-native/capture-actions.json). Screens are original actual ADB screencap/pull PNGs; no browser render, generated image or altered original is used. Prior diagnostic/failed runs keep their own provenance.

## Actual workflow and source verification

| Step | Safe Harbor and Night Harbor evidence |
|---|---|
| Load retained model | Settings -> On-device conversation ideas -> Load downloaded model; actual experimental-model-loaded status captured. No Download action was activated. |
| Private writing | Opened child journal, created Fictional award example, typed the fictional award entry and saved it in memory. Saved notice and complete private caption are visible. |
| Optional generation | Explicit Find words to share action; actual source recorded as `on-device-model` in each theme and displayed on the result. The capture uses --require-local-model and fails on a template fallback. |
| Separate composition | Explicit Prepare separate words opens editable starter with Alex still saying Choose, not preselected. |
| Recipient and review | Actual Alex tap followed by Review my words; Review says To Alex and contains the exact separate starter. |
| End state | Returned Home without activating Simulate send. No real or simulated journal-derived message was sent by this run. |

The full actions file independently confirms both accepted-source labels, exactly two Load downloaded model actions and two deliberate Alex taps, and no Simulate send tap. Loading used the retained model asset rather than redownloading it. The app's native manager validates model assets before loading; the screenshots themselves show loaded state, not an independent byte-level model audit or network trace.

## Meaning, privacy and safety review

The entry is: "I won an award today for my school project. I would like to tell someone about it." The accepted starter in both themes is: "Can we talk about something I want to celebrate? I'd like you to listen first." Review repeats this separate starter, not the full entry. It preserves the broad celebration context and requests a conversation without diagnosis, treatment, hidden emotional interpretation or instructions to solve the underlying situation. Alex is chosen by the user action, not by the model.

This is a short native output accepted by strict postvalidation, including a safe celebration phrase; it is not proof that arbitrary model output is reliable or safe. The local-template fallback remains a separate implementation path and is not misreported as native inference here. This run does not exercise unsafe-recipient adversarial cases; their domain/browser checks and blocking evidence remain separate.

Every visible account/entry is fictional. No personal information, credentials, real financial data or unrelated journal appears in these originals. Review explicitly states that journal entries and other drafts are not attached. Simulate send remains truthfully labelled. No journal transport, production authentication or real delivery claim is inferred merely from UI copy.

## Visual findings

All 12 originals render coherently at full phone width with readable text, stable navigation and intentional primary actions. Both editor privacy captions are complete. The saved entry, accepted-source label, starter, preparation actions and recipient choice are legible. Night Harbor applies to writing surfaces, fields, controls, review paper and navigation; the approved logo uses its deliberate light backing tile. No tiled rendering artifact, overlapping controls or forgotten light form surface was found.

The result is scrolled to show the full starter/actions, placing its eyebrow near the upper viewport edge; this does not hide the model-source label or sharing actions. Some lower setup controls and review secondary actions require normal scrolling. The loaded state and primary journal action are visible. No urgent layout or privacy defect was found in the inspected states. This is a visual/interaction review, not numerical contrast or screen-reader speech certification.

## Limits and remaining release gates

This run validates the fictional child workflow on one normal-size Android emulator in both themes. Physical Android, iOS, spoken TalkBack, tablet/density and 200% text are not certified by this run; historical failures and any later targeted results retain separate reports. It does not test every language/context or certify the experimental native runtime for release. The full automated regression, model license/runtime risk review, production identity/consent, private storage, abuse handling and authorization remain separate gates.

Journals/drafts/messages remain memory-only. Appearance and explicitly downloaded model assets are the approved persistence exceptions. No real message, notification or money moved. This reviewer changed only this report, with no ADB, source, package, Git or original-image modifications.

## Independent original verification

All 12 PNG SHA-256 values and IHDR dimensions were independently recomputed and match the final manifests: six originals per theme, each 1080 x 2424. Every original byte is preserved.

| Original | Dimensions | SHA-256 |
|---|---|---|
| [light/optional-model-loaded.png](light/optional-model-loaded.png) | 1080 x 2424 | `1e119368407fdf8fed30365e9750e64f65876f796cdf7e8384fc3560e3b44f29` |
| [light/journal-overview.png](light/journal-overview.png) | 1080 x 2424 | `455e08564c337a1a56a7ec41380878976729a201e8d80c7c08ad2a94e78ec6f8` |
| [light/journal-editor.png](light/journal-editor.png) | 1080 x 2424 | `1cb35a5ac17d59c09fb71ae3ab1ed88190f3736e9748b0c2eb0d2fd5deca41c5` |
| [light/journal-inline-suggestions.png](light/journal-inline-suggestions.png) | 1080 x 2424 | `918ba26b53e7540c5b3f9c995180ec033b9b0e041862a4830b8c1dd360893aae` |
| [light/journal-recipient-choice.png](light/journal-recipient-choice.png) | 1080 x 2424 | `8f92d8b33d8a36f582eecdf98cc6fffbe11791cc37033dc6f1ec65dea9129ee9` |
| [light/journal-message-review.png](light/journal-message-review.png) | 1080 x 2424 | `fea36f48ea73546f4fca1e6a18c332b91ba793f20cb48487700666b9240b955c` |
| [dark/optional-model-loaded.png](dark/optional-model-loaded.png) | 1080 x 2424 | `a743038701ff5b48b9004fd3149e930a8ef197679a0f4e680ade76a585a73ef5` |
| [dark/journal-overview.png](dark/journal-overview.png) | 1080 x 2424 | `4ec461a9242388f3574c61dd51cd3747140064a69fc020c8f5e1842b5474f0bb` |
| [dark/journal-editor.png](dark/journal-editor.png) | 1080 x 2424 | `d027ba52365e5e851991390ff3c5a2d9305ce0890ca726ce18f9580142eebe9e` |
| [dark/journal-inline-suggestions.png](dark/journal-inline-suggestions.png) | 1080 x 2424 | `0ad3a52d4d23c21d1ec08f8686a95857d4e9fc33b2aa6b9156785cfbc920ca64` |
| [dark/journal-recipient-choice.png](dark/journal-recipient-choice.png) | 1080 x 2424 | `2d997d8730c7c6ad8387d019713857302dda0b07866fc2e7ac77f8f0ceeb48d6` |
| [dark/journal-message-review.png](dark/journal-message-review.png) | 1080 x 2424 | `61ff2b022939b01ab03be961449b46b97fe7aebee502b9355a451f6e464b9629` |
