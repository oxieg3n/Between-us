# Savings goals and Family Savings Envelopes

The implementation uses the same append-only ledger as chores and payouts; see [ALLOWANCE_LEDGER.md](ALLOWANCE_LEDGER.md). All examples are fictional and memory-only. A savings envelope is a planning record of money owed or reported held by a parent. It is not a bank account, escrow account, protected balance or financial transfer.

## Own savings

A child may create multiple goals with a name, integer-cent target and optional target date. The example goals are a $70 game, $250 bicycle and $40 gift. Child allocations consume approved, available, unpaid earnings. Allocation by amount cannot exceed available earnings or the goal's remaining own-savings target.

A percentage can use all available earnings or only available earnings approved during the current allowance period. In the latter case, both the percentage base and consumed source lots use that same family-local period; older free lots remain untouched. Percentages round down. A zero eligible base produces a clear validation error.

Optional fixed and percentage savings rules run on each new approval. Percentage rules use that approval's reward; fixed rules are capped at the remaining new reward. Rules run in accepted order and clamp to the new reward and remaining target, so rules cannot overdraw older earnings. Editing a rule is prospective. Disabling it leaves existing allocations intact.

Moving own savings between goals is a source-lot transfer, not another earning or matching contribution. Releasing savings returns eligible unpaid cents to the free balance under the parent's explicit release policy; released cents cannot generate another match. A child can edit a target or cancel a goal. Own earmarks must be released before a target can fall below them. Cancelling an earmarked goal follows the release policy; an empty goal can be cancelled directly. Cancelled goals and their history remain visible.

A parent may declare how much of a goal's own earmark they report holding and add a short location label, such as “Fictional cash envelope.” The declaration cannot exceed the earmark. Transfers, releases and corrections reduce stale held declarations when necessary. The label is not an account connection or proof of funds.

## Parent matching

The setup defaults are 100%, a $20 calendar-month cap per child shared across goals, a separate $20 monthly parent matching budget, Surprise and manual reveal. The fixture leaves matching **off** until a parent explicitly enables it. Rules apply to newly accepted allocations only; previous goal money is not retroactively matched.

The commitment is the minimum of the newly eligible allocation times the rate, remaining child/month cap, remaining separate parent/month budget and remaining target room. The cap is reserved immediately on commitment, not at payment. No cap rolls forward. Rule edits change future matching; existing commitments retain their original rates and amounts. A restricted eligible-goal list is supported by the command contract.

At the approved default, allocating $8 then $15 yields parent commitments of $8 and $12 across the two goals. The child has earmarked $23 of their own earnings. A third allocation in that month earns no further matching. Another child has an independent cap; the next family-local calendar month starts a new cap, including the December/January boundary.

Released, transferred, previously paid, reversed and parent-funded cents do not generate another match. Original eligible earning attribution follows funds through transfers so later reversals reconcile the correct commitment even at rates above 100%. Unfunded commitments are reduced through recorded compensating effects. Already reported-funded portions keep their paid status and produce a parent-only reconciliation obligation rather than disappearing from history.

An explicit parent `reconcile_match` action records a corrected funding report or a parent-reported return, with amount, date and reason. It reduces the unresolved obligation and net contribution through an appended reversal. Gross original reported funding and reconciled amounts remain separate, and original funding events remain intact. Cancelling a now-empty source goal after moving its own savings still flags any funded commitment attached to that cancelled goal. No reconciliation action moves actual money or receives provider confirmation.

## Surprise visibility

Child projections omit the entire matching configuration and hidden commitment ledger. Hidden amounts never enter child goal totals, progress, activity, notifications or accessible metadata. Child operations validate against their own savings capacity; hidden promises cannot change their available target or error messages. If a later own allocation crowds an unfunded promise, the ledger compensates that promise internally. Equivalent-world tests compare complete child projections and operation outcomes with matching enabled versus disabled.

Manual reveal and funding are separate parent actions for a selected commitment:

| State | Child display/progress |
| --- | --- |
| Hidden pledge or hidden parent-reported funding | No parent amount or added progress |
| Revealed, unpaid | Parent plans to contribute; separate from saved progress |
| Revealed, partly parent-reported funded | Reported portion contributes; unpaid remainder stays planned |
| Revealed, fully parent-reported funded | Own savings and parent contribution shown separately; transfer remains unverified |

Progress toward a target is capped at that target, while own and parent source totals remain separate and exact. New own allocations may fill a target independently of hidden parent funds. External-provider notifications can reveal a transfer; Between Us promises surprise visibility only inside its own prototype interface.

## Cash-out and payment bridge

Only free, unallocated earnings can be requested for payout. To cash out an earmark, the child must deliberately release it first under the parent rule, then request the available amount. Requests reserve their cents, preventing duplicate requests or allocation of the same money. Parents may settle partially and record method, date and note. Children may acknowledge receipt. There is no transfer automation, provider balance, credential capture or provider-confirmed payment status.

Provider guidance and its current official references are documented separately in [NO_COST_PAYMENT_BRIDGE.md](NO_COST_PAYMENT_BRIDGE.md). Family Savings Envelopes works with cash/manual settlement even when no external service is available.

## Production limits

Event immutability and role projections are useful prototype safeguards; they do not establish authentication, secure storage, legal compliance or enforceable provider custody. Production requires authenticated server-side object authorization, atomic transaction and idempotency constraints, reviewed identity/consent, retention, key custody and independent security review. Real children, real financial information and real money movement remain outside this build's authorization.
