# Native input regression — 2026-11-15

Status: the typing mitigation passed a bounded native diagnostic and the subsequent frozen r5 exact-input capture in both themes. Save/revisit, keyboard geometry and wider native interaction checks remain separate. All input and screenshots use fictional examples on the Android 17 Pixel_10 AVD; this is not physical-device validation.

## Failure evidence

The [r4 native journal manifest](../1115-r4-journal-native/capture-manifest.json) records source `193b1bb04f5db2a0b06756aad218c514136e4450`, build `1115-FamilyEnvelopes-Journal-r4`, and a failed exact-value assertion for **Entry title**. The model had loaded, but no journal generation had started when typing failed.

Expected title: `Fictional award example`.

| Original Android PNG | Visible result | SHA-256 |
| --- | --- | --- |
| [Bulk input mismatch](bulk-input-mismatch.png) | `Fictional award exa example` — a duplicated fragment | `1dfe395c0b1b4a27d6f66756872eff0435cf9551433b1cb136a288f900eac1e7` |
| [Focused input mismatch](focused-input-mismatch.png) | `Ictional award example` — the first F is missing | `9e94f5357f460f891c4159a03910bf343488f2afbffd24fc8dc217bd34ab478d` |

Both files are original 1080×2424 ADB PNG bytes preserved by the master from diagnostic captures, without image manipulation. Their hashes were independently recomputed for this report. Additional normally paced, single-character injection after explicit focus/select-all/delete and an empty-field check also produced an extra initial F. Sending each character once did not establish exact retained text.

## Mitigation and bounded recovery

The master observed exact title and body retention after setting `autoCorrect={false}` and waiting for explicit focus/clear transitions. The source change applies that prop to journal title/body, shared fields and the message draft. iOS-only `spellCheck` flags were removed. No forced cursor selection, changing input keys, text rewriting or uncontrolled-input refactor was introduced.

React Native 0.88's [Android input manager](https://raw.githubusercontent.com/facebook/react-native/v0.88.1/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactTextInputManager.kt) maps `autoCorrect={false}` to Android's `TYPE_TEXT_FLAG_NO_SUGGESTIONS`. Its [native edit-text implementation](https://raw.githubusercontent.com/facebook/react-native/v0.88.1/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactEditText.kt) also documents composing-span issues when keyboards clear text. These support an IME/composition interaction as a hypothesis; they do not prove the underlying cause of this specific regression. Disabling correction is not a claim about keyboard network behavior.

The diagnostic [typing-recovery manifest](../1115-native-input-prediction-disabled/capture-manifest.json) records successful fictional title/body filling, Save and an actual `on-device-model` source. The subsequent [native review proof](../1115-native-model-review-proof/capture-manifest.json) links the [accepted starter](../1115-native-model-review-proof/light/journal-suggestion-complete.png), [explicit recipient choice](../1115-native-model-review-proof/light/recipient-choice.png) and [Review screen](../1115-native-model-review-proof/light/review.png). The source label and Review PNGs were inspected: the separately prepared celebration request reaches Review for Alex, and Send was not activated in that proof.

That proof explicitly has `tracked_source_dirty: true` and describes experimental correction flags. It supports the mitigation in that diagnostic configuration; it is not final r5 acceptance or a complete journal/model benchmark.

## Final r5 exact-input capture

The completed [r5 manifest](../1115-r5-journal-native-v2/capture-manifest.json) identifies frozen source `afca46fa881b6c17b40c2c32bee9d97cd45c3554`, build `1115-FamilyEnvelopes-Journal-r5`, clean tracked app source, twelve screenshots, `completed: true` and `error: null`. Each theme records successful exact-value assertions for the title and body, followed by Save. The [light editor](../1115-r5-journal-native-v2/light/journal-editor.png) and [dark editor](../1115-r5-journal-native-v2/dark/journal-editor.png) visibly retain the exact title and complete fictional paragraph without the earlier corruption.

Both themes then show accepted native-source starters and an explicit recipient/review workflow, as documented in the [final visual QA report](../1115-r5-journal-native-v2/VISUAL_QA_REPORT.md). All twelve PNG hashes/resolutions were independently checked against the completed manifest. This supersedes the earlier dirty diagnostic as evidence of the bounded r5 typing/capture pass. It does not prove every keyboard, input pace, saved-entry revisit, focus transition or IME geometry case.

## Remaining native regression

1. Frozen r5 identity, restart/reload and exact-input captures are observed above. Repeat those baseline checks after any further writing-path change.
2. Extend the exact-input pass to deliberate bulk and normally paced variants. Save, leave and revisit; confirm unchanged text and stable focus. Do not silently repair mismatches in the harness.
3. Check both roles, unsaved-draft protection, optional ideas off/on, stale-generation cancellation and absence of journal-to-finance disclosure.
4. On native messaging, verify full input/Review bounds above a visibly open IME; actually tap Review with the keyboard open, edit, review and simulate the exact final draft.
5. Both-theme editor/ideas/review captures passed. Representative phone/tablet sizes and 200% font scale still require separate interaction checks and restoration of device overrides. Record assertions and actual PNGs, including failures.

The exact-input assertions and saved editor captures above passed. The broader interaction plan is retained for the master's separate native check run; this report does not mark all of it passed. Broader keyboard/language coverage, manual soft-keyboard checks and supported physical-device tests remain necessary before claiming production writing reliability.
