# Between Us: Chores & Goals feature specification

Status: APPROVED PRODUCT REQUIREMENTS, NOT IMPLEMENTED

Implementation update: the fictional mobile prototype now has a tested allowance/savings domain and integrated role-specific workflows. See [mission build report](mission/BUILD_REPORT.md) for actual validation, screenshots and remaining release gates. The approved requirements below remain intact; real payments, authentication and secure persistence are not enabled.
Parent system: family administrators
Design: The Open Letter; Safe Harbor and Night Harbor
Existing branch: feature/mobile-foundation

## Purpose

Help parents assign chores and approve earned allowances while allowing children to practice deciding between saving and spending. This is a family feature, not a bank, custodial wallet, or payment processor.

## Key workflows

1. A parent sets a weekly, biweekly, or monthly allowance pool for each child, then assigns task rewards in integer cents. Chores can be one-time or recurring; each occurrence is tracked independently.
2. A child sees chores, marks an occurrence complete, and the parent receives an approval request. Approval credits an earnings ledger exactly once; a child's self-report never directly credits earned funds.
3. The parent sets payout cadence separately from the allowance period: per approved task, daily, weekly, biweekly or monthly.
4. Parents may mark a payout as paid manually. This is **parent-reported** until a supported provider integration independently confirms it. Do not call merchant checkout APIs P2P payout APIs; do not automate Cash App/Venmo using scraped screens or unofficial routes.
5. Children can allocate *approved, eligible, unpaid* allowance earnings toward multiple savings goals or request their remaining eligible amount for payout under parent rules. An allocation is a planning/ledger record, not a transfer into a provider balance.
6. Parents can optionally match savings allocations, with separate parental budgets and reveal controls. This child-facing feature must never expose undisclosed surprise amounts.

## Approved initial parent savings match

- Enabled in the initial Chores & Goals configuration example (not a silent activation in production).
- Match rate: **100%** (dollar-for-dollar).
- Cap: **$20.00 USD per child per calendar month** across all eligible savings goals combined, unless an authorized parent later configures otherwise.
- Visibility: **Surprise**, invisible to child views until parent explicitly reveals.
- Reveal trigger: **Manual parent action** by default.
- Match against newly allocated, approved, eligible child earnings only.
- Treat matching as a **separate parent-funded pledge/obligation**, not an automatic deposit. Do not imply Cash App, Venmo, or other external money is present.
- Matching is **not** deducted from the child's allowance pool. Track a separate parent matching budget.
- The match applies prospectively, with effective timestamps; do not retroactively credit historic allocations without an explicit parent-approved adjustment.
- See [PARENT_SAVINGS_MATCHING.md](PARENT_SAVINGS_MATCHING.md) for required edge cases, data semantics, safety, and tests.

## Default experience

Parent: Chores & Goals > Savings Matching > Configure. Show 100%, $20/month per child, and Surprise selected as the illustrative starting configuration; clearly distinguish setting up a rule from actually funding it. Require intentional confirmation before enabling a real rule.

Child: Chores & Goals > My Savings Goals. Show their own allocated earnings and any **previously revealed, confirmed** parent contributions; never include secret, proposed, or unpaid pledges in child-visible savings totals, percentages, summaries, notifications, accessibility labels or API responses.

## Financial boundaries

- All monetary values are integer cents; use auditable events, idempotency, correct rounding, and period-aware totals.
- Separate approved earnings, earmarked savings, parent match commitments, payments attempted, and payments confirmed. Never double-count.
- On a given child, total active parent-match commitments in a calendar month cannot exceed 2,000 cents; cap is shared across goals.
- Include multiple children and multiple goals in isolation tests.
- Ensure parent/child permissions are enforced in real application authorization, never just hidden UI. Demo role switching is not authentication.
- Do not send personal financial or journal data to AI providers; use fictional data for prototypes.
- Access to safety information or help from a safe adult never depends on parental approval.

## Current development status

As checked against remote feature/mobile-foundation at 36a25a2, the mobile app is a memory-only prototype; there was no Chores & Goals implementation or its specification in this GitHub branch. This file defines future engineering work only. Preserve the separate public GitHub Pages demo and main branch.

## Next implementation references

- [PARENT_SAVINGS_MATCHING.md](PARENT_SAVINGS_MATCHING.md)
- [CODEX_CHORES_MATCHING_ADDENDUM.md](CODEX_CHORES_MATCHING_ADDENDUM.md)
- [OPEN_LETTER_BUILD_REPORT.md](OPEN_LETTER_BUILD_REPORT.md)
- [../AGENTS.md](../AGENTS.md)
