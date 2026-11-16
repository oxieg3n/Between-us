# R12 warm-emulator 200% text QA

Status: **completed, 12 actual Android originals independently checked and visually reviewed; light and dark cold-app 200% text cases passed.** Native appearance persistence passed and device size/density/font settings were verified restored without errors. No blocking visual defect was found within these tested screens. This is not full accessibility certification or production approval.

## Provenance

- Build: `1115-FamilyEnvelopes-Journal-r12`.
- Capture source: `8607573e37dadd66ede3bb368389e0a2531ef6d8`, `feature/mobile-foundation`, as recorded by the [capture manifest](capture-manifest.json).
- APK SHA-256 supplied by the master: `34716578ABD1C9DCB9C255C9993E66F3B00BB532B29AC7DE953095302C8FB6E9`. This reviewer did not build/install or independently hash the APK.
- Pixel_10 AVD, Android **17**, `emulator-5554`, app `com.oxieg3n.betweenus`, Metro 8082. Original viewport **1080 ? 2424**, physical density **420**, original `font_scale` **1.0**.
- Original screenshots use actual ADB `screencap -p` and pull. The master alone operated ADB; this reviewer used the completed manifest, [native results](native-check-results.json), [action log](capture-actions.json) and original PNGs.
- Capture actions run from 2026-11-16 07:42 UTC through approximately 08:00 UTC. All captures remain unaltered.
- Manifest status: `completed: true`, `error: null`. Manifest SHA-256: `6afe61124854f63e19e1351b8ce228984f9f3d00e56a7923427c8b63d34cffa9`.

## What was actually tested

This is **one isolated retry on the already warm SwiftShader emulator**, after the master's 86 stable ordinary r12 captures. The app was force-stopped before changing the OS font scale to 2.0 and then relaunched. The model had been force-stopped/unloaded first. The Android OS/emulator stayed warm. Consequently, this run tests cold-app startup with the changed system text scale; it does **not** test retention of a live unsaved journal draft during a hot font-scale change.

The [native result file](native-check-results.json) records:

| Case | Recorded result | Scope |
| --- | --- | --- |
| Safe Harbor at 200% | Passed | Four labeled navigation controls, goal view, long matching-rule dialog with reachable Confirm and Cancel; actual Cancel, no rule saved |
| Night Harbor at 200% | Passed | The same enlarged-text controls and actual cancellation; no rule saved |
| Native appearance persistence | Passed | Night Harbor selected before and after a full app force-stop/relaunch, without selecting it again |
| Device restoration | Verified restored | Original size/density and `font_scale`, zero restoration errors |

For both enlarged-text cases, the native hierarchy records all four navigation targets within `[21,2172]` through `[1059,2340]` collectively. Confirm bounds were `[129,1625,951,1787]`; Cancel bounds were `[129,1840,951,2002]`. These are bounded controls within the 1080 ? 2424 viewport. The original images visually corroborate their legibility and placement. The operator canceled the dialog rather than saving the displayed prospective financial rule.

The final two images independently show Night Harbor still selected after restart and then Follow device appearance selected with the device's light colors. The native results verify restoration to original size/density/font settings; the master additionally reported returning Home afterward. This reviewer did not issue device commands or treat the final settings screenshot alone as proof of every restored OS property.

## Integrity and visual review

All **12** PNGs matched their manifest SHA-256 values, PNG signatures and IHDR dimensions (**1080 ? 2424**), with no missing or unlisted originals. Total original size: **2,529,859 bytes**. Counts are **5 light, 6 dark, 1 system**: five enlarged-text frames per theme plus one dark persistence frame and one system-selection frame. Every original was opened and visually inspected; no screenshot was altered or replaced.

At 200%, Home text wraps naturally, the primary Talk to someone action remains readable, and Home/Journal/Chats/Circle labels remain on screen. The approved symbol and editorial hierarchy remain recognizable. Goal title, parent-held planning disclaimer, exact `$0.00` available earnings and All savings goals action remain readable. The goal screenshot does not frame all lower allocation controls, so this review does not claim a full enlarged-text audit of every financial form.

The long matching-rule dialog fits the title, full prospective-rule explanation, Confirm and Cancel above the bottom navigation in both themes. The modal's light and dark surfaces, text and actions retain clear visual separation. There are no missing glyphs, corrupted screenshots, visible ANR overlays or clipped modal action labels in this run. The three dialog screenshots within each theme are identical views because the required actions already fit; they are not three different saved states.

**Capture-description clarification:** the preserved manifest/native-result wording includes ?Scrolled? for the action/cancel captures. In this actual run the relevant controls fit without needing to scroll. The supported claim is that Confirm and Cancel were visible/reachable and cancellation completed. No actual scroll transition is inferred from those repeated frames, and no matching settings were saved. The master is correcting future harness labels; this report preserves the original evidence rather than rewriting its history.

## Earlier failures and limits

The earlier [r11 large-text attempt](../1116-r11-large-text-v3/QA_REPORT.md) and [cold SwiftShader dark retest](../1116-r11-dark-large-text-swiftshader/QA_REPORT.md) remain failed historical evidence. The latter encountered a System UI ANR before dark build verification/200% setup and later recovered through the standard Wait action. That failed dark attempt is not relabeled as a pass.

This successful **current warm retry closes the previously uncompleted cold-app Night Harbor 200% case for the tested r12 screens**. It does not identify or prove a fix for the prior graphics corruption/System UI ANR root cause, establish emulator stability under arbitrary OS stress, or prove that SwiftShader itself corrected the cause. No second retry was performed by this reviewer. No app code, test, native setting or original image was changed by this reviewer; only this report was written.

Physical Android hardware, iOS, spoken TalkBack/VoiceOver, accessibility focus order and semantics, hot font-change draft retention, all other screens at 200%, alternate IMEs and formal accessibility certification remain open. Visual legibility and hierarchy checks cannot replace those interaction reviews or production identity/consent/privacy release gates.

## Original screenshots

Each linked original was independently hash/signature/dimension checked and visually reviewed.

| Original | SHA-256 |
| --- | --- |
| [light/font-200-home.png](light/font-200-home.png) | `18964fc76b3a110368a1bd24de52ed434276ef22a3b868e714e985e63a2465bd` |
| [light/font-200-goal.png](light/font-200-goal.png) | `130ea656a8be49495b45a8896fd4762cd26de1a370f9bbfda0258ec0b98ac217` |
| [light/font-200-confirmation-top.png](light/font-200-confirmation-top.png) | `cd2380e61be28cda778a5e01eff1e2ec495e7809326246b8a2c713cf096600d4` |
| [light/font-200-confirmation-action.png](light/font-200-confirmation-action.png) | `cd2380e61be28cda778a5e01eff1e2ec495e7809326246b8a2c713cf096600d4` |
| [light/font-200-confirmation-cancel.png](light/font-200-confirmation-cancel.png) | `cd2380e61be28cda778a5e01eff1e2ec495e7809326246b8a2c713cf096600d4` |
| [dark/font-200-home.png](dark/font-200-home.png) | `2317fb525a7b36bbb9ff006f61d5e65f6778dda8ec487dfa7f03dea815aaa0bb` |
| [dark/font-200-goal.png](dark/font-200-goal.png) | `487e11ce65aac60a220bd73d5f610928aafc13b7d11e725487a884ee2688422b` |
| [dark/font-200-confirmation-top.png](dark/font-200-confirmation-top.png) | `672bdc8823e3723b878c8688a07554d69e4ed4088e4ca3ca28c5506b71a07ff3` |
| [dark/font-200-confirmation-action.png](dark/font-200-confirmation-action.png) | `672bdc8823e3723b878c8688a07554d69e4ed4088e4ca3ca28c5506b71a07ff3` |
| [dark/font-200-confirmation-cancel.png](dark/font-200-confirmation-cancel.png) | `672bdc8823e3723b878c8688a07554d69e4ed4088e4ca3ca28c5506b71a07ff3` |
| [dark/appearance-after-restart.png](dark/appearance-after-restart.png) | `882243c178cad5664f3c4085501b302d74dea6ae1788d2b6fd55f32825eca712` |
| [system/appearance-follow-device.png](system/appearance-follow-device.png) | `8972d66e28615f121ef78e60b37af14056786983e6447192a7569d6aa92fd157` |
