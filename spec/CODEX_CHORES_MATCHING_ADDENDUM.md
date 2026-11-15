# Codex continuation addendum: implement approved Parent Savings Match

## Starting context

Windows project: `D:\projects\BetweenUs` (canonical corrected path).
GitHub: https://github.com/oxieg3n/Between-us
Feature branch: `feature/mobile-foundation`
Product: Between Us, The Open Letter, Safe Harbor light, Night Harbor dark.

Read all project AGENTS.md instructions first. Preserve the existing mobile application and the separate GitHub Pages demo.

Current approved matching default:
- 100% match
- $20.00 monthly cap **per child**, pooled across all eligible goals
- Surprise visibility
- Parent-controlled manual reveal
- Child's existing allowance pool is not debited by parent's match
- No Cash App/Venmo money movement is assumed

Authoritative specification: `spec/PARENT_SAVINGS_MATCHING.md` and `spec/CHORES_AND_GOALS.md`.

## Relocation dependency

Before performing this feature's work, execute [WORKSPACE_RELOCATION_ADDENDUM.md](WORKSPACE_RELOCATION_ADDENDUM.md) if the local checkout still lives under the misspelled `D:\proejcts` folder. Run all Git operations from `D:\projects\BetweenUs` after verification.

## First steps

1. Audit working tree, local commits, and current branch; reconcile this documentation-only remote commit with ongoing local work without force-pushing or discarding changes.
2. Read the two new specs, current build report, appearance/theme tokens, permissions, and other active feature work.
3. Do not assume Chores & Goals exists: it was absent from the checked remote branch when this specification was written. If local agents have already implemented it, integrate matching into their domain model instead of rewriting it.
4. Split tasks among domain/ledger, parent UX, child UX, security/privacy and test agents with separate ownership.
5. Keep real money execution disabled; user has authorized requirements and code for a simulated feature, **not** real transfers.

## Domain implementation

Create a typed parent rule and an immutable match-event model in integer cents; single per-child monthly cap is shared across goals. Parent match obligations are separate from allowance and from child savings allocations.

Build a pure deterministic calculator plus tests before connecting UI. A single accepted child allocation must have at most one match event. Persist no sensitive financial information in this prototype unless a reviewed security design has been explicitly approved. Use fictional data in memory.

Account for month boundaries in the family timezone, concurrency, idempotency, reversals, goal changes, multiple children, and match-budget exhaustion.

## Screens and interactions

Parent:
- Chores & Goals > Savings Matching > rule setup, default 100%, $20 cap, surprise.
- Explicit save/enable confirmation.
- Parent dashboard showing commitments, confirmed contributions, cap remaining, unrevealed matches and manual Reveal action.
- Separate statuses for pledged, parent-reported paid and provider-confirmed.

Child:
- Chores & Goals > Savings Goals with own contributions and child-only progress until reveal.
- Once revealed, show the actual parent match status without claiming pending pledges are real savings.
- Show own savings distinctly from parent funds.

Keep the established four bottom destinations intact; Chores & Goals is a contextual feature. Implement native styles in both themes, accessible currency labels and large-text layouts.

## Non-negotiable privacy and permission checks

- No child's ability to manage or reveal a parent match.
- Parent admin access never exposes private journal entries.
- No hidden match info in child views, APIs, activity histories, notifications, accessibility labels, cached state or alternate role simulations.
- Do not claim transfers, current payment balances, or provider-held savings without independently verified integration.
- No automated transfers; external payment services' alerts cannot be hidden by Between Us.

## Verify before delivery

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:ui` and appropriate Android tests where available.

Include deterministic cases:
- Child saves $8 => parent pledges $8.
- Child saves another $15 in same month => parent pledges only $12.
- Combined parent match is capped at $20, child saved $23, child only sees $23 until reveal.
- Separate second goal and second child.
- Boundary of new month.
- Duplicate and concurrent completion events.
- Reversal/reallocation without double-matching.
- Hidden-ledger data leakage checks in all child surfaces.
- Pledge vs confirmed funding messaging.

Capture real Android screenshots in Safe Harbor and Night Harbor showing parent setup, parent surprise ledger, pre-reveal child savings and post-reveal child savings. Report what remains simulated.

Commit on appropriate feature branch; do not modify `main`, deploy a public demo, use paid services or enable money movement without owner approval.

Deliver a concise change report with test results, commit SHA, screenshots and remaining security limitations.
