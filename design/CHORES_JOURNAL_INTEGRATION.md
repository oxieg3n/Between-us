# Chores, savings and journal integration

The Open Letter remains the interface authority. Reuse [approved semantic tokens and shared components](OPEN_LETTER_DESIGN_SYSTEM.md); preserve the exact logo and four main destinations: Home, Journal, Chats, Circle.

## Design guidance used

The local installed-skills and repository scan on 2026-11-15 found no UI/UX Pro Max, Prompt Sensei or UI-App-Design-Agent-Guide installation in the searched skill/project locations. No plugin, hook or global configuration was installed. Installed design-principles guidance informs hierarchy, restraint and reviewing the built result; humanizer informs short, concrete copy. The approved Open Letter specification overrides generic recommendations. Taste-skill's website, hero-animation and deployment workflow does not apply to this native feature.

## Entry and hierarchy

Home retains its editorial greeting, “Some things are easier to write.” and primary **Talk to someone** action. Add one quieter **Chores & Goals** text row with a short role-specific description. It opens a nested feature, not another tab or a grid of feature tiles. Keep a visible Back action on nested screens and preserve Android Back history.

The nested landing screen chooses one immediate action: child **View my chores**, parent **Review completions** when any are pending, otherwise **Assign a chore**. Earnings and goals appear as concise text rows below. Parent settings, matching, payout workspace and history are secondary labeled rows; reveal details progressively.

## Parent flows

| Screen | Main task | Supporting detail |
| --- | --- | --- |
| Chores | Assign/review | Plain list: child, due date, reward, status; no shame for pending work |
| Assignment | Save future chore | Title, instructions, child, cents reward, recurrence and due date; budget impact before save |
| Review | Approve once | Exact occurrence/reward; retry/decline with optional note; clear pending-review empty state |
| Allowance | Save budget | Weekly/biweekly/monthly amount, anchor date, family zone; payout cadence chosen separately |
| Payout workspace | Record parent-reported payment | Ready amount, goal holdbacks, partial payment, method/date/note; public provider guide and copy preview |
| Savings matching | Enable rule explicitly | 100%, $20 monthly per child across goals, Surprise, manual reveal; separate matching budget |
| Match ledger | Reveal chosen pledge | Goal, commitment, funding source, reveal state; preview effect and confirm |
| History | Inspect events | Readable amount, actor, time, source and compensating corrections |

Show matching as a promise until reported funded. Reveal confirmation says whether the child will see a planned pledge or a reported contribution. No confetti or animation delays. Explain that external provider notifications can reveal a transfer independently.

## Child flows

Use calm lists for **My chores**, **Awaiting review**, **My earnings** and **Savings goals**. A submitted chore says **Waiting for parent review**, without implying earnings. Show approved, earmarked, held for a payout and parent-reported paid separately; use readable currency and explanatory text instead of a wallet metaphor.

Goal rows show name, target, own earmarked savings and text progress. Goal detail provides **Add to this goal**, amount/percentage choices, optional fixed/percentage allocation rule, move/release choices and auditable history. Validate before confirmation and preserve input when an error occurs. Goal adjustment/deletion explains where earmarks go and requires confirmation.

Cash-out shows only eligible unallocated cents. A request says **Requested — parent action needed**. Offer optional **I received this** only for a parent-reported payment. Before parent reveal, no matching label, amount, hidden-ledger count or secret-derived completion appears. After reveal, separate **I saved** from **My parent contributed** and label unpaid plans accurately.

## Quiet journal suggestions

Writing remains the main surface. **Conversation Ideas While I Write** is off by default and session-only. Keep an explicit **Find words to share** action available. After an opted-in pause, show at most two suggestions below the editor, never over the keyboard or Save action. A quiet busy/status line may say **Finding words on this device**; unsupported devices say **Local conversation starter** with a useful explanation.

Each suggestion offers a short title, neutral reason and editable draft preview. **Choose someone** starts deliberate recipient selection; avoid a preselected potentially unsafe parent. Show **Prepare for in person** when a contact is not eligible for in-app messaging. The user then edits, chooses a response preference and reviews exact text/recipient before a simulated send. No automatic sharing or success claim on generation alone.

Shorter, Simpler, More direct, More like me and Another way are optional text actions near the suggestion. Keep dismissal and safety information reachable. Preserve unsaved writing and user-edited drafts when generation fails, changes entry, becomes stale or is disabled.

## Both themes and native behavior

Use editorial serif headings, native readable body text, quiet separators and selective paper surfaces. Keep money/status lists open rather than putting every amount in a card. Use Safe Harbor `primary` and Night Harbor `primary` through semantic tokens; labels and text identify states without relying on color.

All actions have at least 48 dp targets, explicit accessible names/states and visible focus. Allow text wrapping and 200% scaling; stack amount/action rows instead of clipping. Use the established outer keyboard-avoidance layout, scrolling forms and labeled Save/Review actions. Financial input errors identify the field and retain values. Respect safe areas, reduced motion, phone/thumb reachability and tablet reading width.

## Integration review criteria

Confirm the primary action is obvious on every screen. Test actual flows at 320 dp width, a standard/large phone and a tablet; test large text and an open keyboard. Capture real Android light/dark chores, approval, earnings, goals, parent matching setup/ledger, child before/after reveal, journal suggestions, message review and manual payout. Document screenshot source build/commit, defects and retests. Screenshots support interaction/accessibility checks; they do not replace them.
