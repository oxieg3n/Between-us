# Financial checkpoint r3 visual QA

**PASS for the local emulator flows below. Public release remains NO-GO.** Mobile build `1116-FinanceCheckpoints-r3`, unchanged backend `1116-FinanceCheckpoints-r2`, Android debug0.6.0/code5. Canonical checkout `D:\projects\BetweenUs`, branch `feature/staging-release-qualification`; UI engineering commit4cb4d0f. Capture-time Git provenance is in the manifest; later evidence/tooling commits do not change the tested UI.

## Device and artifact

Actual Pixel_10 / emulator-5554, Android17/API37/x86_64, standard1080x2424/density420/font1.0. The same AVD used the viewport overrides below; these are not four physical devices. The installed debug APK SHA256 is `f78cf067dd0989647e414824386f3d533c5f970eb1234ff6b7fc11a973882e6a`,414,309,977bytes, package `com.oxieg3n.betweenus`; [actual native byte/permission inventory](../../../production/staging/finance-checkpoints/ANDROID_ARTIFACT.json). It requires Metro and is not an owner-signed/frozen production release.

## Actual results

- Four distinct managed-account parent/child light/dark journeys passed:16parent captures/theme and13child captures/theme,58main images. Theme selection was changed through the actual app; current build footer was verified. Financial history pagination, selected retained sources, review cancellation, current payment rows, goals, Circle and separate parent-only matching history were reached with real touches.
- Twelve extra images bring the native total to70. Saved archived receipt was independently verified in SQL:0to1 acknowledgment, earned1100cents/paid200cents unchanged, hidden matching absent and no transfer. [Write proof](NATIVE_FINANCE_WRITE.json).
- Hot200% text preserved the unsent2.00USD amount. Keyboard correction input remained usable. Android hardware Back returned from nested finances. Small840x1680/420,standard1080x2424/420,large1260x2730/420 andtablet1920x2560/320 overview/history controls were used. [Six actual device checks](NATIVE_CHECKS_RESUME1.json).
- Existing conversation composer and author-only locked journal were verified on native Android. The focused own MainActivity carried SECURE in both flows. Neither protected screen was captured, unlocked or bypassed; no chat was sent or journal changed. [Core privacy checks](NATIVE_CHECKS_CORE.json).
- An actual guarded package restart preserved selected Dark without selecting it again; current r3 Home/build was verified. [Restart proof](THEME_RESTART.json).

## Defects found, corrected and preserved

1. r1 actual receipt hydration exposed a literal inline JSX space inside a native View. It caused the real payment-row red error, despite browser tolerance.7343bf7 removed it and three renderer regressions prevent recurrence. Both roles/themes and the acknowledged row now render correctly. [Before-fix frame](../finance-checkpoints-r1/before-fixes/payment-row-native-text-error.png).
2. r2 visual review found historical action confirmations omitted selected target/date/amount/reason after hiding the record.4cb4d0f binds identifying details to the same staged record/action and adds six callback regressions. r3 native and browser checks assert those details, including parent-private matching and child receipt reference. [Earlier r2 review](../finance-checkpoints-r2/light/parent-earning-review.png), [corrected r3 review](light/parent-earning-review.png).
3. QA setup initially reused an already-hydrated old record, then needed explicit Back recovery from a nested screen. Historical partial frames remain under r2/before-fixture-refresh; no source history was erased. A fresh isolated fictional fixture avoids reinterpreting that old acknowledgment. A role-authorized API page index only guides actual Next-page touches; no deep link, mocked screen or UI bypass replaces navigation.
4. The r3 extended harness first checked only visible Back controls, missing an offscreen Back; its [failed receipt](NATIVE_CHECKS.json) remains. Native scrolling fixed the harness. The next run passed all six device cases, then incorrectly expected focus metadata in the Android17 windows dump. Direct own-window inspection showed SECURE; focus is in the displays dump. The corrected focused-window check passed both protected flows in the separate core receipt. The failed overall result in RESUME1 is preserved; it is not relabeled PASS.

## Visual inspection and accessibility scope

The four comparison sheets and representative native keyboard, review, payment, large-text and viewport frames were inspected. Approved logo/palette, Open Letter headings, soft borders and selected navigation states remain. No significant overlap, missing glyph, forgotten light surface in dark mode or clipped financial text was observed in these flows. Long records/review reasons scroll; Return to editing may lie below the initial viewport and was reached in every review-cancel journey. Identifying references wrap instead of being truncated. The historical-review comparison uses matched top-of-screen views, improving the earlier r2 record scroll-offset comparison.

Browser accessibility scans in the managed suite supplement these native checks; they do not certify TalkBack. Physical ARM64 devices, minimum/current device backup/keystore/model/thermal tests, full TalkBack traversal, iOS/VoiceOver, actual push delivery and final signed artifact inspection remain unavailable. [Backup policy/source limits](../../../production/staging/finance-checkpoints/ANDROID_BACKUP_REVIEW.md). No source control, fabricated screenshot or generated mockup replaces a hardware test.

## Actual image index

[Original image hashes, role/theme cases and device metadata](SCREENSHOT_MANIFEST.json). All data is fictional. Private credentials, journal contents and model prompts are absent.

| Screen | Safe Harbor | Night Harbor |
| --- | --- | --- |
|parent appearance|[Light](light/parent-appearance.png)|[Dark](dark/parent-appearance.png)|
|parent archive page|[Light](light/parent-archive-page.png)|[Dark](dark/parent-archive-page.png)|
|parent build|[Light](light/parent-build.png)|[Dark](dark/parent-build.png)|
|parent circle|[Light](light/parent-circle.png)|[Dark](dark/parent-circle.png)|
|parent earning review|[Light](light/parent-earning-review.png)|[Dark](dark/parent-earning-review.png)|
|parent finances|[Light](light/parent-finances.png)|[Dark](dark/parent-finances.png)|
|parent goals|[Light](light/parent-goals.png)|[Dark](dark/parent-goals.png)|
|parent history entry|[Light](light/parent-history-entry.png)|[Dark](dark/parent-history-entry.png)|
|parent home|[Light](light/parent-home.png)|[Dark](dark/parent-home.png)|
|parent matching history|[Light](light/parent-matching-history.png)|[Dark](dark/parent-matching-history.png)|
|parent matching review|[Light](light/parent-matching-review.png)|[Dark](dark/parent-matching-review.png)|
|parent matching|[Light](light/parent-matching.png)|[Dark](dark/parent-matching.png)|
|parent note keyboard|[Light](light/parent-note-keyboard.png)|[Dark](dark/parent-note-keyboard.png)|
|parent payment row|[Light](light/parent-payment-row.png)|[Dark](dark/parent-payment-row.png)|
|parent payouts|[Light](light/parent-payouts.png)|[Dark](dark/parent-payouts.png)|
|parent settled record|[Light](light/parent-settled-record.png)|[Dark](dark/parent-settled-record.png)|
|child appearance|[Light](light/child-appearance.png)|[Dark](dark/child-appearance.png)|
|child archive page|[Light](light/child-archive-page.png)|[Dark](dark/child-archive-page.png)|
|child build|[Light](light/child-build.png)|[Dark](dark/child-build.png)|
|child cashout review|[Light](light/child-cashout-review.png)|[Dark](dark/child-cashout-review.png)|
|child circle|[Light](light/child-circle.png)|[Dark](dark/child-circle.png)|
|child finances|[Light](light/child-finances.png)|[Dark](dark/child-finances.png)|
|child goals|[Light](light/child-goals.png)|[Dark](dark/child-goals.png)|
|child history entry|[Light](light/child-history-entry.png)|[Dark](dark/child-history-entry.png)|
|child home|[Light](light/child-home.png)|[Dark](dark/child-home.png)|
|child payment row|[Light](light/child-payment-row.png)|[Dark](dark/child-payment-row.png)|
|child payouts|[Light](light/child-payouts.png)|[Dark](dark/child-payouts.png)|
|child receipt review|[Light](light/child-receipt-review.png)|[Dark](dark/child-receipt-review.png)|
|child settled record|[Light](light/child-settled-record.png)|[Dark](dark/child-settled-record.png)|

## Extra native frames

- [Actual native archived receipt acknowledgment saved by the local server; no transfer.](extra/child-receipt-confirmed.png)
- [Actual200percent hot text change preserved the unsent2.00USD input; no payout requested.](extra/child-payout-font-200.png)
- [Night Harbor financial viewport on the same Pixel_10 override; not separate hardware.](responsive/small-financial-overview.png)
- [Actual bounded history entry and accessible controls on the same AVD override.](responsive/small-history-entry.png)
- [Night Harbor financial viewport on the same Pixel_10 override; not separate hardware.](responsive/standard-financial-overview.png)
- [Actual bounded history entry and accessible controls on the same AVD override.](responsive/standard-history-entry.png)
- [Night Harbor financial viewport on the same Pixel_10 override; not separate hardware.](responsive/large-financial-overview.png)
- [Actual bounded history entry and accessible controls on the same AVD override.](responsive/large-history-entry.png)
- [Night Harbor financial viewport on the same Pixel_10 override; not separate hardware.](responsive/tablet-financial-overview.png)
- [Actual bounded history entry and accessible controls on the same AVD override.](responsive/tablet-history-entry.png)
- [Existing actual managed conversation list after financial-history navigation.](extra/child-conversations.png)
- [Actual selected Dark preference persisted across a guarded process restart; no theme selection was changed for this proof.](extra/restarted-dark-appearance.png)

## Four comparison sheets

Original full1080x2424 phone viewports, Safe Harbor left and Night Harbor right, unscaled beneath a100px label. Each2160x2524 sheet preserves all viewport pixels; no crop/retouch hides a defect. [Source/output hashes](COMPARISONS.json).

- [Home](comparisons/home-side-by-side.png)
- [Financial summary](comparisons/financial-summary-side-by-side.png)
- [Historical earning review](comparisons/historical-review-side-by-side.png)
- [Parent matching history](comparisons/matching-history-side-by-side.png)

Journal overview/editor/reflection and active-conversation pictures were intentionally not captured because their production privacy boundary is protected. The actual native locked/composer interfaces and own SECURE windows were checked instead. No privacy protection was disabled for visual review. Existing historical evidence remains separate.

See the [full financial report](../../../production/staging/FINANCE_CHECKPOINT_REPORT.md) and [release qualification](../../../production/staging/FINAL_RELEASE_QUALIFICATION.md) for measured capacity, actual automated results and precise internal/external limits.
