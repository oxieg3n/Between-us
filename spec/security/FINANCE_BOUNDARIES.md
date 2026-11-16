# Financial prototype permissions and information boundaries

Status: implementation review contract for the approved fictional prototype, 2026-11-15. Passing domain tests does not establish production security. Follow [existing boundaries](BOUNDARIES.md), [matching specification](../PARENT_SAVINGS_MATCHING.md) and [master mission](../MASTER_MISSION_CHORES_SAVINGS_INTELLIGENT_JOURNAL.md).

## State and identity

Financial events, journals, drafts, contacts and check-ins remain in memory. Appearance is the only persisted preference; the current mission additionally authorizes explicitly downloaded licensed model assets, never personal content or model sessions. No analytics, financial/journal logs, provider credentials, remote inference or real transfers. Native tooling can inspect process memory; the role selector is a fictional-user inspector, not authentication.

Production must derive actor, family and child membership from an authenticated session, independently authorize every object/action and transact ledger updates atomically. Client-provided role flags cannot be trusted. The prototype should still reject unauthorized commands at the pure domain boundary, including commands invoked without a UI button.

| Action | Child | Parent administrator |
| --- | --- | --- |
| Read financial records | Own authorized projection | Managed children's finance, excluding journals/drafts |
| Submit chore occurrence | Own assigned occurrence | Review; never impersonate child silently |
| Approve/retry/decline or edit reward | Denied | Allowed with valid occurrence transition |
| Set allowance or payout cadence | Denied | Allowed prospectively |
| Create goal/allocate eligible earnings | Own goals, within policy | Authorized management with audit |
| Request cash-out | Own available earnings only | Prepare/reconcile authorized payout |
| Report payment/funding or reverse report | Denied | Explicit audited declaration |
| Acknowledge received payout | Own reported payment | Cannot manufacture child acknowledgment |
| Configure/reveal/fund/cancel parent match | Denied | Explicit audited action |
| Read another author's journal/draft | Denied | Denied, including family administrator |
| Access safety help or another safe adult | Always available | Always available |

## Surprise matching is a projection boundary

Build a separate child-facing read model. Do not pass raw parent state/events to child components and merely hide labels. Exclude unrevealed commitments, matching budgets, monthly cap usage, funding details, secret event counts and parent-only notes from child objects, exports, accessibility descriptions, previews and errors. Use opaque identifiers; a visible global sequence must not expose hidden event counts.

Two states with the same public child events but different hidden matches must produce identical serialized child views. Test this equivalence for goal totals, percentage, completion, available allocation, payout eligibility, activity, navigation summaries and copied text. The domain module may hold parent records in memory for the demo; never describe this as protection from a device debugger.

Hidden matching must not reduce a child's displayed allocation ceiling or change a child-visible validation error. Calculate child capacity using child-visible funds. If later own allocations leave less room for an undisclosed unpaid pledge, use an explicit audited parent-side adjustment policy; do not reveal the pledge through a mysterious maximum. Already reported payments require reconciliation, not silent cancellation.

Revealed unpaid pledges are visible as plans and remain outside funded progress. Only revealed, parent-reported funded contributions enter child contribution totals, labeled with that source. Keep own savings and parent contributions separate. A parent-reported funded amount is never provider-confirmed.

Role switching clears nested parent-only screens, pending confirmations, selected match IDs and forms. A child route/deep link to parent management must fail closed. No automatic notification to a parent when a child seeks safety information or writes about an unsafe guardian.

## Ledger integrity

| Failure | Required control and negative test |
| --- | --- |
| Duplicate/retried approval | One earning per occurrence; repeat identical command is idempotent; changed payload with reused ID rejects |
| Allocate and cash out same cents | Derive available cents after allocations and active payout holds in one accepted transition |
| Overflow/fractional/negative amount | Validate safe integer cents; explicit bounded percentages and rounding; reject NaN/Infinity/unsafe totals |
| Replay/cross-child command | Validate owner/family/object relationships before applying events, even on duplicate path |
| Recurrence rewrites earnings | Independent occurrence IDs and reward snapshots; future edits preserve past events |
| Budget or monthly cap oversubscription | Reserve on accepted event; one shared cap per child/month across goals; independent parent budget |
| Reallocation earns another match | Transfer existing earmark; never treat it as newly eligible earnings |
| Reversal erases paid history | Append compensating entries; retain payment source/status and outstanding reconciliation |
| Timezone/DST drift | Persist effective family IANA zone and UTC event timestamp; deterministic local period calculations |
| UI claims bank custody | Use tracked/earmarked/parent-reported wording; no bank balance, escrow or provider-confirmed labels |

Validate raw dates and zones at command boundaries. Avoid parsing local timestamps by the tester's machine timezone. A retry is idempotent only within the authorized actor/object scope; an existing command ID must not bypass permission checks.

## Journal and model separation

Finance modules accept no entry text, model output, inferred topic or suggestion score. A journal must never affect chore eligibility, reward, match or parental visibility. Parent financial reports contain no journal/draft fields. Optional local journal generation uses only the active author's deliberate input and authorized contact choices.

Treat model output as untrusted data. Validate schema, length and permitted recipient IDs/routes before showing a draft, and revalidate recipient permission at review/send. Never invent a verified contact. Exclude contacts named or categorized as unsafe; uncertainty should retain a neutral other-safe-adult option instead of asserting safety. Journal text is data, not model instructions. Do not log prompts, raw outputs or failed generations.

Disable/cancel results on text edits, role/entry changes, navigation or opt-out. Generation cannot send messages, alter finance state or persist entries. The user chooses a recipient, edits separate words and reviews exact text. Approved context snippets do not authorize copying the entire entry or exposing it to a parent.

## Manual payment and export boundary

The [no-cost bridge](../NO_COST_PAYMENT_BRIDGE.md) uses ordinary official provider pages and explicit parent declarations. Opening a site or copying a note cannot settle a request. No account links, guessed payment URLs, scraping, credentials or automation. Provider choice conveys no verified provider relationship.

Clipboard and screenshots leave app memory and may survive app restart. Restrict this prototype to fictional records, preview copied content and require explicit export actions. Exclude secret parent data from child output; parent financial exports still exclude other people's journals. Do not enable broad exports or personal-data capture without a reviewed retention/export design.

## Required review evidence

Run direct unauthorized-command tests, identical-public-state secrecy tests, payout/goal double-spend tests and calendar/rounding/idempotency cases. Check both role screens and accessibility metadata after reveal, before reveal and after role switching. Inspect both themes, narrow screens, 200% text and keyboard-open forms using actual interactions.

Read-only review on 2026-11-15 independently exercised in-memory command sequences after integration fixes: a 200% unpaid match fully reverses with its earning; a funded reversal retains the reported payment and adds the exact parent-only correction obligation; malformed February 30/November 31 UTC timestamps reject; equivalent child projections remain identical with and without hidden matching, including a funded correction. Messaging composer, recipient selection, review and final simulated send all check recipient restrictions. These checks used fictional records and no provider, browser or Android session. Full native/accessibility results belong in the mission QA report.

The subsequent focused `npx tsx --test tests/finance.test.ts` run passed all 37 tests. Added regressions cover cancelling a funded source goal after moving its earmarks, parent-only partial/full reconciliation with retained original payment history, exact accepted-boundary currency formatting, and financial activity amount/actor/reference fields without hidden matching effects. These are domain checks; rendered UI and production authorization remain separate gates.

Real-user release remains gated by identity/age/consent review, server or secure local authorization/storage, key custody and recovery, immutable audit retention/deletion policy, dispute/correction handling, child-safety operations, privacy notices and independent testing. No production claim is made by this document.
