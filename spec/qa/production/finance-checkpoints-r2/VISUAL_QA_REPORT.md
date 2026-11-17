# Financial checkpoint r2 visual QA

Build **1116-FinanceCheckpoints-r2**, Android debug **0.6.0/code5**, package `com.oxieg3n.betweenus`. Actual Pixel_10/emulator-5554, Android17/API37/x86_64,1080x2424/density420/font1.0; viewport overrides below use that same emulator. The main manifest records capture-time Git heads (7343bf7/4cc521d/c46bbd7 source lineage); the unchanged debug APK and its135 native objects are independently inventoried in [ANDROID_ARTIFACT](../../../production/staging/finance-checkpoints/ANDROID_ARTIFACT.json). APK SHA256 `f78cf067dd0989647e414824386f3d533c5f970eb1234ff6b7fc11a973882e6a`. JS runs through the verified canonical Metro; this is no signed or frozen release.

## Outcome and defects

All four actual managed parent/child light/dark financial journeys PASS:16parent captures/theme and13child captures/theme,58 total. The extended run added10actual native images: saved historical receipt,200% text, and two financial screens across four viewport overrides. It verified six financial/device cases, then the additional optional core-navigation smoke stopped on a transient post-resize Home-bound check; the finally block restored1080x2424/density420/font1.0. That stopped harness is not a completed core-navigation pass.

**Visual sign-off is withheld for r2:** manual inspection found historical earning confirmation did not repeat the selected record/title/date/amount/reason. The next build adds identifying details from the same staged target and inputs, with callback regressions and fresh review evidence. No correction/reveal was confirmed during these main captures. The real native archived receipt acknowledgment did execute against the fictional local family:SQL0to1, earned1100cents/paid200cents unchanged, no hidden matching returned or transfer executed; see [independent write proof](NATIVE_FINANCE_WRITE.json).

The earlier genuine native payment-row raw-text crash is fixed in7343bf7 and retested here in both roles/themes, including acknowledged hot receipts after hydration. [Before-fix Android frame](../finance-checkpoints-r1/before-fixes/payment-row-native-text-error.png). This was a real defect; browser rendering had tolerated it. Three native-renderer regressions were added, bringing the mobile suite to295passing tests.

The main capture helper first expected an already-acknowledged old fixture record to remain archived, then initially failed to navigate from an existing nested screen. These are preserved setup failures. A fresh isolated fictional family and explicit nested Back recovery fixed QA setup without deleting/reinitializing historical data. Six earlier partial images remain in [before-fixture-refresh](before-fixture-refresh/SCREENSHOT_MANIFEST.json); they are excluded from the58complete-case count.

## Visual inspection

Approved logo, Open Letter editorial headings, Safe Harbor and Night Harbor surfaces and visible four-tab selection remain. Financial nested screens retain explicit Back/account controls; older histories use bounded pages. Normal text, keyboard fields, parent/child permissions and review cancellation are visible in the images. A retained record needs normal vertical scrolling; the original settled-record comparison has a different scroll offset between themes, which is preserved rather than cropped or retouched. No claim of pixel-identical offsets or whole-form visibility in a single viewport is made.

200% text preserved the unsent2.00USD input and wrapped the financial body. Small840x1680/density420,standard1080x2424/420,large1260x2730/420 andtablet1920x2560/320 financial overview/history-entry controls were reached through actual interactions. These are AVD overrides, not four physical devices or a native tablet certification. Full TalkBack exploration, physical device input, biometrics/keystore/recovery, OEM backup, push, iOS/VoiceOver and owner-signed release validation remain external/native release gates. No protected journal/conversation window was captured or bypassed.

## Actual screenshots

[Capture hashes/device manifest](SCREENSHOT_MANIFEST.json), [six actual device checks and restored settings](NATIVE_CHECKS.json).

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

## Additional native images

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

## Derived comparisons

The four2160x2524 sheets place original1080x2424 native viewports unscaled below a100px label. No source pixels were altered to hide defects. [Source/output hashes](COMPARISONS.json).

- [Child home](comparisons/home-side-by-side.png)
- [Child finances](comparisons/financial-summary-side-by-side.png)
- [Settled record, different original scroll offset](comparisons/settled-record-side-by-side.png)
- [Parent-only matching history](comparisons/matching-history-side-by-side.png)

See [current release qualification](../../../production/staging/FINAL_RELEASE_QUALIFICATION.md) for successor evidence and remaining release gates. This report preserves r2 findings; it does not certify the later build or public child safety.
