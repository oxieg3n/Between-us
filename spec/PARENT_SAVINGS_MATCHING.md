# Parent Savings Match: approved implementation specification

Status: PRODUCT REQUIREMENTS; IMPLEMENTATION AND PAYMENT INTEGRATION PENDING
Feature: Between Us > Chores & Goals > Savings Matching

## Locked initial settings

| Setting | Approved initial value |
| --- | --- |
| Match rate | 100% dollar-for-dollar |
| Cap | $20.00 (2000 cents) per child per calendar month |
| Scope | Shared cap across the child's eligible goals |
| Visibility | Surprise |
| Default reveal | Manual by parent |
| Eligibility | New, parent-approved allowance earnings allocated by the child to eligible goals |
| Parent funding | Separate from the child's allowance pool |
| Payment | No automatic Cash App/Venmo transfers |
| Effective date | Prospective only, after parent explicitly enables rule |

A parent may later change rate, cap, goal eligibility and visibility for **future** matching, with a clear confirmation. Retroactive adjustments are separately recorded and always auditable. Do not silently change earned or promised amounts.

## Example: the approved scenario

Sam has two eligible new savings allocations during the same family-local calendar month:

- Allocation A: $8.00 child contribution. Parent match commitment: $8.00.
- Allocation B: $15.00 child contribution. Only $12.00 remains of the parent's $20.00 monthly cap. Parent match commitment: $12.00.
- Month totals: child contributions $23.00; parent commitments $20.00; cap remaining $0.00.

Before reveal, Sam sees **$23.00 of their own tracked savings**, never the hidden $20.00. The parent sees both contributions, monthly matching cap consumed, funding status, and unrevealed commitments. A pledge is not a completed external transfer.

## Definitions and ledger

- **Child saving contribution**: Earmarking approved, available allowance earnings for exactly one goal. This should not create or assert a real financial transfer.
- **Eligible match**: A parent-funded commitment generated for an eligible child allocation under an active rule.
- **Committed/pledged match**: An obligation recorded in the parent's match ledger. Reserve its cents against the month cap. It is *not* a verified payment.
- **Funded match**: Contribution confirmed by the supported payment process (or labeled parent-reported if manual). Keep provider-confirmed and manually reported as separate states.
- **Reveal**: Parent intentionally grants visibility of a specified match or group of matches to the child. Reveal and actual funding are separate.
- **Child-visible goal progress**: Child's own eligible earmarked savings plus eligible **revealed and confirmed** parent contributions, excluding hidden and unpaid promises.

Model rule, contribution, parent commitment, payment event, reveal event and reversal as separately auditable records with unique IDs, child/parent IDs, goal IDs, currency, cents, timestamps and source references.

Never store a real cash balance in Between Us as if it were a bank account. A goal is an accounting/planning representation; actual funds may remain with the parent or with the external provider. Do not let the UI claim cash custody.

## Calculation and calendar semantics

For each newly eligible contribution:
- Match base = eligible child amount in cents.
- Target at 100% = match base.
- Amount committed = min(target, remaining *parent monthly matching cap*, allowed remaining goal amount).
- Remaining matching cap = 2000 - sum(active match commitments and funded matches attributable to that child/month, avoiding double count).
- Use integer cents and a single authoritative event ledger.
- Month boundaries use the family's configured IANA time zone. Record the effective zone and UTC timestamps for repeatable period assignment.
- The cap resets on calendar-month boundaries, not rolling 30-day windows.
- Reserve cap upon commitment, not only when a payment completes, to avoid oversubscription.
- Treat simultaneous allocations transactionally, with idempotent processing. A contribution event can create at most one matching obligation under the active rule.
- Unused monthly cap does not roll over by default.
- Do not match a parent's match, external balance movements, existing goal balances, reallocations between goals, duplicate submissions, cancelled or unapproved chores, or the same child contribution twice.
- If a goal is nearly funded, match only the remaining eligible target; don't automatically send excess to another goal without the child's deliberate allocation.
- If a contribution is reversed, record a corresponding compensating adjustment. Do not destroy history; clearly track any funds already paid and require appropriate correction workflows.

If a child allocates to multiple goals, consume the single cap in chronological accepted-transaction order, not per-goal separate caps.

## Parent UI: Chores & Goals > Savings Matching

- An explicit opt-in toggle, an editable match percentage (100% preselected for the illustrative rule), and a monthly cap (2000 cents).
- Visibility toggle: Visible / Surprise, with Surprise preselected for this configuration.
- Reveal strategy: Manual initially; optional scheduled/goal-triggered modes only after tests and additional approval.
- A separate ledger view for each child showing own savings, matched cents, pending funding, spent cap, remaining cap, goals, and undisclosed commitments.
- Confirmation before changing a rule or revealing a surprise. Parent sees exact effect and whether a match is a pledge, manually reported payment, or provider-confirmed transfer.
- Administrative access to matching rules must not grant private-journal access.

## Child UI: My Savings Goals

- Before reveal show the child's own savings, ordinary visible contributions and accurately calculated child-only progress.
- Do not surface secret amounts through summaries, milestones, completion flags, statements, search, exports, notification text, screen-reader semantics, deep links, activity lists, alternate accounts, screen caches or API payloads.
- After reveal, show a celebration that doesn't imply payment if only pledged: "Dad plans to contribute $20" versus "Dad contributed $20" only after confirmed funding, with exact funding status.
- Maintain separate "I saved" and "My parent contributed" totals so a child can see their own effort.
- Keep goal transfers, goal deletion, changing goals, and cash-out flows separate from matching bookkeeping.

## Surprise behavior and safety

Surprise means secret **inside Between Us only**. External services may display payments, account updates or transaction notifications; never promise provider-side secrecy or attempt to suppress provider alerts. Prefer withholding physical transfer until reveal when a guaranteed surprise is important and permitted.

A parent should not be able to mislead the child into believing an unpaid pledge is a settled balance. Revoke/alter prospective matching easily, but changes to already promised or paid matches require an explicit audited adjustment.

No rewards based on private journal analysis. No public rankings, coercive savings streaks, financial pressure, or engagement manipulation.

## Required acceptance tests

1. First allocation 800 cents yields 800-cent commitment.
2. Second allocation 1500 cents in same month yields 1200-cent commitment, not 1500; total exactly 2000.
3. Third allocation in same month yields 0, preserving the child's own savings.
4. Allocation to second goal shares the original 2000-cent monthly cap.
5. Another child has an independent cap and ledger.
6. Next calendar month resets the new period's cap (including year boundary, local midnight and timezone edge cases).
7. Repeated or concurrent approval/contribution events never create duplicate matches.
8. A child cannot create, increase, reveal, fund or cancel parent commitments.
9. A child cannot infer hidden amounts from any child-visible surface or accessibility metadata.
10. Revealed but unpaid pledge is labeled "planned/pledged", never "paid/saved in provider".
11. Only funded and revealed parent contributions enter child-visible funded progress.
12. Rule edits are prospective; old commitments and transactions remain auditable.
13. Reallocating child savings between goals does not generate a second match.
14. Reversal adjusts ledger without deleting audit history or losing confirmed payment status.
15. Goal nearly complete never overmatches its remaining eligible target.
16. Cash App and Venmo remain unconnected simulated choices until approved integrations are independently verified.
17. Native parent and child screens pass Safe Harbor and Night Harbor visual, keyboard and screen-reader testing.
18. No private journal or unrelated contact can access matching data.

## Release gate

Until actual authentication, authorized storage, payment/reconciliation, verified provider integration, child age requirements and safety protections pass review, use fictional data and simulate all financial movement. Never commit secrets, API keys, payment credentials or personal financial information.
