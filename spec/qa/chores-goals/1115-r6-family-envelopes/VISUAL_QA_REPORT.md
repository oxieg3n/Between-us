# Family Savings Envelopes: native visual QA

Status: **financial screenshot review complete for both themes; no blocking visual defect found within this scope**. The final manifest reports `completed: true`, `error: null`, with 50 actual Android screenshots: 25 Safe Harbor and 25 Night Harbor. Both complete standard-phone financial workflow sequences are reviewed below. This sign-off does not cover native screen-size, keyboard or spoken-accessibility checks, which the master performs separately.

## Evidence and integrity

- Build: `1115-FamilyEnvelopes-Journal-r6`.
- Source at capture: `2f151d15607240be2d36df1d05fa661640abd7f4`, `feature/mobile-foundation`.
- Manifest reports no tracked source changes; its tracked-diff SHA-256 is the empty-content digest.
- Device: Pixel_10, Android 17, `sdk_gphone16k_x86_64`, `emulator-5554`, physical density 420.
- App: `com.oxieg3n.betweenus`, Metro 8082, canonical repository `D:\projects\BetweenUs`.
- All 50 listed PNG files were read directly and visually inspected: **25 light and 25 dark**. Every byte SHA-256 value, PNG signature and IHDR dimension matches [capture-manifest.json](capture-manifest.json): **1080 × 2424**, original portrait viewport. No hash or resolution mismatch was found, and no unlisted PNG existed in this capture directory during final verification.
- The manifest identifies actual ADB screencap/pull output. This reviewer inspected the original files with `view_image` and did not alter, crop or generate images.
- [capture-actions.json](capture-actions.json) records the master's actual navigation, child submissions, parent approvals, explicit enabling, allocations, reveal, funding reports, partial payout, receipt acknowledgment and unpaid-remainder cancellation in both themes. Its final completion action is timestamped `2026-11-16T02:16:35.698343+00:00`. This reviewer did not operate ADB or the application.

## Screens inspected

| Screen | Original screenshots | Visible evidence and limitations in both themes |
| --- | --- | --- |
| Child chores | [Light](light/child-chores.png) / [Dark](dark/child-chores.png) | $8 reward is `not started`; copy explains parent review before earning. Child has Mark done, no parent approval control. |
| Awaiting review | [Light](light/child-awaiting-review.png) / [Dark](dark/child-awaiting-review.png) | $15 task visibly says `submitted by child`; $5 task remains `not started`. In-app queue is explicitly not push delivery. First task is above this scrolled viewport. |
| Parent review | [Light](light/parent-chores-review.png) / [Dark](dark/parent-chores-review.png) | Parent assignment control and submitted task are readable. Approval/retry controls lie below this particular viewport; supplementary framing is needed. |
| Approval confirmation | [Light](light/parent-approval-confirmation.png) / [Dark](dark/parent-approval-confirmation.png) | Complete dialog states $8 fictional earnings, approval once, and separate Confirm/Cancel actions. The background shows the actual approval control. |
| Allowance budget | [Light](light/allowance-budget.png) / [Dark](dark/allowance-budget.png) | $30 weekly pool and start date are readable. Copy distinguishes budgeting from parent-executed payments. |
| Payout schedule | [Light](light/payout-schedule.png) / [Dark](dark/payout-schedule.png) | Per-task/daily/weekly/biweekly/monthly choices, selected weekly state, minimum payout and Review are visible. Scrolled explanatory text is partly outside the top viewport. |
| Matching setup | [Light](light/matching-setup.png) / [Dark](dark/matching-setup.png) | 100%, $20 child/month cap, separate $20 parent budget and Enable control are readable. The Surprise control is below this frame. |
| Enable confirmation | [Light](light/matching-enable-confirmation.png) / [Dark](dark/matching-enable-confirmation.png) | Complete dialog specifies the shared calendar-month cap, all active goals, hidden until reveal and future allocations only. Confirm and Cancel fit. |
| Approved earnings | [Light](light/child-earnings.png) / [Dark](dark/child-earnings.png) | Approved/available $23 is distinct from $0 earmarks, payout holds and parent-reported paid. Still unpaid is $23; the page says no payment API and manual/simulated reminders. |
| Own goal before reveal | [Light](light/child-goal-before-reveal.png) / [Dark](dark/child-goal-before-reveal.png) | Own $8 of $70, 11%; parent-reported contribution remains $0. Available earnings $15 and explicit no-money-moved notice are visible. No hidden parent amount appears. |
| Goals before reveal | [Light](light/child-goals-before-reveal.png) / [Dark](dark/child-goals-before-reveal.png) | Available earnings are $0; first goal shows own $8/11%. Bicycle and third goal lie below the viewport, so this image alone does not visually establish the full $23 allocation split. |
| Parent shared cap | [Light](light/parent-match-ledger.png) / [Dark](dark/parent-match-ledger.png) | Reserved $20; cap remaining $0; separate parent budget remaining $0. Family month/zone and provider-alert surprise limitation are readable. |
| First parent commitment | [Light](light/parent-match-first.png) / [Dark](dark/parent-match-first.png) | $8 active pledge, $0 parent-reported funded, Hidden from Sam, pledged, and explicit Reveal control. |
| Second parent commitment | [Light](light/parent-match-second.png) / [Dark](dark/parent-match-second.png) | $12 active pledge, $0 funded, Hidden from Sam; Reveal, funding and Reverse controls fit. Combined with the first commitment, this supports the $20 shared cap. |
| Reveal confirmation | [Light](light/parent-reveal-confirmation.png) / [Dark](dark/parent-reveal-confirmation.png) | Complete selected-$8 dialog states that revealing alone does not fund it. |
| Revealed, unpaid | [Light](light/child-revealed-unpaid.png) / [Dark](dark/child-revealed-unpaid.png) | Own savings remain $8/11%, reported contribution $0. The visible $8 parent plan explicitly says the unpaid pledge is excluded from progress. |
| Funding confirmation | [Light](light/parent-funding-confirmation.png) / [Dark](dark/parent-funding-confirmation.png) | Complete $8 manual contribution dialog calls it a family report, not provider verification or a transfer. Confirm and Cancel fit. |
| Revealed, reported funded | [Light](light/child-revealed-funded.png) / [Dark](dark/child-revealed-funded.png) | $16 of $70/22% is split into own $8 and parent-reported $8. The child's own amount is preserved. |
| Cash-out request | [Light](light/child-cashout-request.png) / [Dark](dark/child-cashout-request.png) | After the third earning, approved earnings are $28, earmarks $23 and payout hold $5, leaving $0 free. The $5 input and Request control fit; the payout row begins below this viewport. |
| Parent payout summary | [Light](light/parent-payout-workspace.png) / [Dark](dark/parent-payout-workspace.png) | Same $28/$23/$5 partition and $0 paid are readable, with manual/simulated delivery wording. External-method controls are below this frame. |
| Partial payment confirmation | [Light](light/parent-payment-confirmation.png) / [Dark](dark/parent-payment-confirmation.png) | Complete $2 cash report dialog with date and explicit no-money-moves statement. |
| Partial payment record | [Light](light/parent-partial-payment.png) / [Dark](dark/parent-partial-payment.png) | Payout 1 says partially paid: requested $5, reserved $3, parent-reported paid $2. Copy amount/note and Record payment are visible; it explicitly says not provider verified. Cancel begins at the lower scroll edge. |
| Child acknowledgment | [Light](light/child-payment-acknowledged.png) / [Dark](dark/child-payment-acknowledged.png) | Same $5/$3/$2 record plus the $2 cash/date line saying child confirmed receipt, not provider verified. No parent payment-management controls appear in this child record. |
| Unpaid remainder cancelled | [Light](light/parent-payout-remainder-cancelled.png) / [Dark](dark/parent-payout-remainder-cancelled.png) | Free amount $3, earmarks $23, holds $0 and parent-reported paid $2; unpaid total $26. The paid portion remains after cancelling the remainder. |
| Financial history | [Light](light/financial-history.png) / [Dark](dark/financial-history.png) | Cancellation and child acknowledgment remain with actor, reference and timestamp. The parent payment row starts at the lower edge; its monetary detail requires another scrolled frame. No journal text is visible. |

## Visual findings

Safe Harbor uses the expected light background, Ocean Blue actions, readable slate text and quiet borders. Serif headings and open spacing retain The Open Letter direction. No neon accents, decorative statistics or competing feature-card grid appears in these screens. Nested Back and settings access remain visible; all four bottom destinations retain icons, labels and a clear Home-selected state.

Night Harbor retains the same hierarchy with soft slate backgrounds/elevated surfaces, light primary text, muted secondary text and restrained Mist action fills. Inputs, summaries, matching records, selection outlines, dialogs, notices, status/navigation bars and fixed bottom navigation all follow the dark palette. No forgotten white light-theme field/card or unreadable black text appears. Selected weekly/all-goals states are distinguishable by outlines and tone; primary actions have dark text on the light accent. These are visual observations, not a new contrast certification or screen-reader test.

Complete labels, form values and modal actions inspected here have no visible text collisions or truncation. Scrollview edges naturally cut off preceding/following content while the fixed navigation remains separate; this is a framing limitation, not evidence that a control itself is permanently clipped. Dialogs fit without obscuring Confirm or Cancel. These images have no keyboard open, so they cannot establish keyboard avoidance.

The financial wording distinguishes own planning/earnings from parent pledges and parent-reported funding. Child pre-reveal frames contain no hidden $8/$12 commitment amounts or parent matching controls. Parent views clearly identify hidden, unpaid promises. This is visible prototype behavior, not proof of server authorization or protection from a process debugger.

The completed image sequences and recorded actions support the master's actual native workflow in **both themes**: $23 earned after approval; own $8 and $15 allocations; parent cap reserved at $20 through $8/$12 promises; intentional reveal with unpaid progress unchanged; separate parent-reported $8 funding; a third $5 earning; $5 cash-out hold; $2 partial cash report; child acknowledgment; and cancellation releasing only the unpaid $3. The final visible partition in each theme is $28 earned = $23 earmarked + $3 available + $2 parent-reported paid, with no payout hold. No screenshot claims an actual transfer, bank balance or provider confirmation.

### Framing gaps to address

1. Add a scrolled parent-review frame with the full Approve / Request another attempt / Decline controls visible.
2. Add a lower matching-setup frame showing the complete selected Surprise control and eligible-goal controls before/around explicit enablement.
3. Add a scrolled child goals frame showing the bicycle's own $15 and the third goal. Keep the current first-goal frame as provenance.
4. An additional history frame could show the full parent-payment row and recorded $2 amount. The existing history frame shows cancellation and acknowledgment clearly.

The large headings and repeated page/demo metadata make some functional controls require scrolling. The current images show readable content and functioning navigation; they do not justify a layout redesign by themselves. The extra frames above would improve owner review without changing the app.

Non-blocking interaction polish: the child cash-out request frame still shows an enabled primary Request control after all $5 has been reserved and free earnings are $0. A future refinement could disable it until an eligible amount is available. This visual review did not perform a duplicate-request attempt; financial duplicate/over-allocation guards are covered separately by automated tests.

## Scope limits and remaining review

- The final manifest completion/error gate passed. All 50 originals and their integrity records have been reviewed, including both-theme revealed-but-unpaid, reported-funded, partial payout, acknowledgment, cancellation and history.
- No blocking visual issue was identified in these captured financial screens. The framing additions and enabled-zero-balance Request polish above remain non-blocking review limitations; no screenshot was edited to conceal them.
- Official external-provider guide pages, copy-to-clipboard completion and advanced funding-method/date forms are not established by these 25 images alone; the visible payout summary/copy controls and manual record flow are represented.
- This set does not establish 200% text scaling, alternative screen sizes, rotation, keyboard behavior, spoken TalkBack/VoiceOver or iOS behavior. Refer only to separately completed native usability evidence for those checks.
- Parent/child roles and all money movement remain fictional, in memory and simulated. Screenshots cannot establish production identity, consent, backend security, encryption or provider confirmation.

No source, screenshots, configuration, Git state or app behavior was modified by this review. The master remains the sole native operator. Separate native usability and release-security evidence must be assessed on its own results.
