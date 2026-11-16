# Android currency-formatting regression

Status: **corrected and verified in the actual r6 Android finance workflow in both themes**. The original r5 failure is retained below. Native size/keyboard checks remain separate.

## Preserved failure

The original [Android render-error PNG](render-error.png) shows **Cannot convert BigInt to number** in the money formatter, reached through the finance `Amount` component. The master copied the original ADB bytes unchanged. Independently recomputed SHA-256: `6306817baf83f4da75e9495aa45bc2fb08a313c759f61a7a956025dfde4ac4cb`; original resolution: 1080×2424. The image contains a renderer diagnostic and project source paths, not real children's or payment-account information.

The [failed r5 finance manifest](../1115-r5-family-envelopes/capture-manifest.json) records:

- Build `1115-FamilyEnvelopes-Journal-r5`, source `40ee36000083ab9bd60778a5bc87e5f58c17ad61`, clean tracked app source.
- Pixel_10 AVD, Android 17, x86_64, `com.oxieg3n.betweenus`.
- An actual **Chores & Goals** tap followed by failure to find the expected finance content; `completed: false`, zero successful finance screenshots.

The missing-content assertion was a consequence of the native render error, not proof of a misspelled UI locator. The failed manifest and screenshot are preserved rather than replaced by a successful run.

## Cause and correction

The formatter supplied `amount / 100n` directly to `Intl.NumberFormat.format`. That is a BigInt. The tested Android runtime rejected it, even though the prior Node/browser gate had passed 67 unit and 17 browser scenarios. This exposed a platform behavior absent from those checks; browser screenshots and bundles alone could not establish native finance usability.

The finance agent changed only the bounded whole-dollar quotient passed to Intl into a Number. The input cents are already validated as a non-negative safe integer; therefore the quotient is at most `floor(Number.MAX_SAFE_INTEGER / 100)` and remains exactly representable. The cents remainder still uses BigInt and is appended as a two-digit string. Parsing, percentage calculations and ledger arithmetic retain their integer/BigInt safeguards; no floating-point division of the full currency amount was introduced.

The new regression substitutes an Intl formatter that rejects BigInt and verifies zero, one cent, ordinary/grouped amounts and the exact maximum-safe result `$90,071,992,547,409.91`. The finance agent reports **38 focused finance tests**, TypeScript and targeted lint passing. This documentation reviewer inspected the changed formatter/test assertions but did not rerun those checks or invoke ADB.

## Native r6 verification passed

The master's [completed r6 native finance manifest](../1115-r6-family-envelopes/capture-manifest.json) records build `1115-FamilyEnvelopes-Journal-r6`, frozen source `2f151d15607240be2d36df1d05fa661640abd7f4`, clean tracked app source, `completed: true` and `error: null`. It contains **50 original PNGs: 25 light and 25 dark**, all 1080×2424. Every PNG hash and resolution was independently checked against that manifest and matches.

The actual app now enters Chores & Goals and renders zero and nonzero currency without the former redbox. The serialized run completed child submission/parent approval, $23 earnings, $8+$15 goal allocations, the $20 shared matching cap with $8/$12 pledges, reveal/funding separation, a $5 cash-out, $2 partial payment report, child acknowledgment, $3 hold release and history in both themes.

Representative originals inspected during this regression review:

| Evidence | Visible formatting / state |
| --- | --- |
| [Light earnings](../1115-r6-family-envelopes/light/child-earnings.png) | $23.00 earned/available alongside correctly rendered $0.00 earmarked, held and paid figures. |
| [Dark match ledger](../1115-r6-family-envelopes/dark/parent-match-ledger.png) | $20.00 reserved; $0.00 monthly cap and separate budget remaining. |
| [Light second pledge](../1115-r6-family-envelopes/light/parent-match-second.png) | $12.00 active pledge, $0.00 funded, explicitly hidden and unpaid. |
| [Dark revealed/funded goal](../1115-r6-family-envelopes/dark/child-revealed-funded.png) | $16.00 progress, separately $8.00 saved and $8.00 parent-reported contribution. |
| [Light partial payment](../1115-r6-family-envelopes/light/parent-partial-payment.png) | $5.00 requested, $3.00 remaining and $2.00 parent-reported paid. |
| [Dark remainder cancellation](../1115-r6-family-envelopes/dark/parent-payout-remainder-cancelled.png) | $28.00 earned; $3.00 available, $23.00 earmarked, $0.00 held and $2.00 reported paid. |

This closes the observed Hermes/Intl rendering regression for the tested native target and flows. Maximum-safe currency remains covered by the deterministic formatter regression; these ordinary-amount native screenshots are not a native maximum-value test. All financial figures are fictional records; no actual money moved and parent reports are not provider confirmations.

Native keyboard, responsive sizes, text scaling and spoken accessibility checks have started separately and are not marked passed by this formatting report. No source, Git state, image bytes or Android state were changed by this review.
