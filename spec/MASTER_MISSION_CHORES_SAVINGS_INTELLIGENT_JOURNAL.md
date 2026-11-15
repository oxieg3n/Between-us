# BETWEEN US: MASTER CODEX IMPLEMENTATION MISSION
## Chores & Goals + Savings + Surprise Matching + Intelligent Journal Conversations

**Status:** Owner-approved combined implementation mission; NOT a statement that these features already exist.
**Research snapshot:** 2026-11-15 (recheck provider docs before shipping).
**Windows workspace:** D:\proejcts\BetweenUs (the spelling "proejcts" is intentional).
**Repository:** https://github.com/oxieg3n/Between-us
**Working development branch:** feature/mobile-foundation
**Verified source baseline:** 36a25a2 (Open Letter mobile); the current remote spec-only commit adds this mission.
**Product:** Between Us | "when it's hard to find the words, start here"
**Design:** The Open Letter; Safe Harbor light; Night Harbor dark.
**Immediate objective:** Deliver a thoroughly tested, genuinely functional, FREE-to-run prototype of both feature groups, with fictional data only, without breaking existing workflows.
**Do not merge to main, publish the public demo, use paid services, store real child data, or move actual funds without new owner approval.**

> **ONE MISSION, ONE ORDERED PLAN.** This file is the implementation coordinator. Earlier detailed specs stay authoritative for their specific approved requirements: [CHORES_AND_GOALS.md](CHORES_AND_GOALS.md), [PARENT_SAVINGS_MATCHING.md](PARENT_SAVINGS_MATCHING.md), [JOURNAL_AND_CIRCLE.md](JOURNAL_AND_CIRCLE.md), [../AGENTS.md](../AGENTS.md), and [../design/OPEN_LETTER_DESIGN_SYSTEM.md](../design/OPEN_LETTER_DESIGN_SYSTEM.md). Read them before changing code. Where an older document describes a prior prototype limitation (for example "no AI provider" or "journal suggestions only after save"), this new owner-approved mission authorizes **optional on-device inference with fictional data, no remote text processing**, and proposes updating the related engineering docs once behavior is implemented. It does NOT approve cloud AI, real money transfers, or real-person data.

---

## 0. Definition of success

1. A parent configures a weekly, biweekly, or monthly allowance pool and assigns chores with individual rewards.
2. A child marks a chore complete; a parent reviews it; only one approval event generates the earned reward.
3. Parent chooses payout cadence independently: per task, daily, weekly, biweekly, or monthly.
4. Child creates **multiple savings goals**, allocates eligible approved earnings by amount or percentage, and requests cash-out of eligible unallocated funds.
5. Parent enables the **approved illustrative default** of **100% dollar-for-dollar match**, **$20.00 total per child per calendar month across all goals**, and **Surprise visibility** with parent-initiated manual reveal. Child cannot see hidden commitments.
6. With **no payment API**, a parent can still manage the entire workflow inside Between Us using a **Family Savings Envelopes** ledger, then separately complete transfers via Cash App, Venmo, or cash and record exactly what happened. It works without provider credentials, fees to Between Us, or unsupported integrations.
7. Journal provides **optional, context-specific, personally worded conversation starters** generated locally where supported. It never diagnoses, treats, psychoanalyzes, or offers advice on how to solve the underlying issue. The author chooses recipients and explicitly reviews any outgoing message.
8. The app keeps existing Open Letter functionality, supports both themes, uses real Android interaction testing, and documents simulated versus actual functionality.
9. All feature logic has deterministic tests, especially financial arithmetic, permissions, surprising matching secrecy, recipient safety, and invalid AI output.
10. No subscriptions, paid APIs, transaction fees charged by Between Us, or user-funded model inference. External providers can still impose their own ordinary fees for certain transfers; never promise that every provider transaction is free.

## 1. Source audit and workspace safety: DO FIRST

- Read root and apps/mobile AGENTS.md, current build report, security boundaries, design spec and three prior feature specs.
- Inspect local Git status, branches, working tree, unpushed commits, and any existing Chores/Journal AI implementation. The local source may be ahead of the remote, and it MUST be preserved. This document is not proof that another agent has not been building.
- Fetch only when safe. Reconcile new documentation without resetting, stashing without reason, forcing, discarding, rebasing over uncommitted changes, or overwriting other agents' files.
- Keep Expo SDK 58 / React Native / TypeScript / Expo Router unless research confirms a necessary and safe change. Review versioned Expo docs before integrating native modules.
- Preserve existing GitHub Pages docs/, root index.html, app logos, site showcase, and main branch. No edits to Powered By Oxieg3n's production site.
- Record baseline commands and results: npm ci if needed, typecheck, lint, unit tests, browser flows, Expo Doctor, and Android smoke test.
- Create a mission checklist and dependency map in spec/mission/PROGRESS.md; update it after each stage. Use meaningful, bounded commits and build identifiers.

### Scope agreement

Treat this as authorization to develop and test fictional **prototype** behavior. Financial state and journals must remain **memory-only** until a separate threat-modeled, secure persistence architecture is approved. Only appearance preference remains persistent under the existing permitted design. A role toggle is NOT authentication. Do not claim cross-device synchronization or real push delivery until supported by a secure service. Do not accidentally persist children's personal content through AsyncStorage, telemetry, crash reporting, caches, device logs or screenshot artifacts.

## 2. Efficient dependency order and parallel work

Use the narrowest viable implementation. Master agent is responsible for integration, quality gates and source control. Parallelize **only independent files and investigations**.

**Stage 0 (serial):** Audit repo, constraints, security and product requirements; establish branch state; baseline checks.
**Stage 1 (parallel, nonconflicting):**
- Finance Domain Agent: typed event ledger, cents, period and role permission contracts, deterministic fixtures.
- Local AI Research Agent: verify currently compatible on-device inference runtimes, licenses, device budgets, and build constraints; create benchmark plan **without modifying core app dependencies yet**.
- UX Agent: wireframes, navigation placement and theme mapping for Chores & Goals and new journal suggestion surface, no source edits that overlap other agents.
- Security Agent: threat model, access rules, data and network boundaries, private journal and surprise-match information flows.

**Stage 2 (Finance path, serial dependencies):** Task definitions/occurrences → completion submissions/parent approval → earned allowance ledger → payout schedule/eligible balance.
**Stage 2 (Journal path, parallel with Finance Stage 2):** Define structured suggestion contract, deterministic fallback, redaction/no-copy semantics, safety filters and test fixtures. Prove chosen native runtime on a suitable test device before committing large dependency changes.
**Stage 3 (Finance path):** Multiple savings goals → child allocations/reallocations → virtual envelopes/holdback and cash-out requests → parent matching and surprise-reveal logic (match logic MUST reuse the same ledger).
**Stage 3 (Journal path):** Optional local model generation → editing/regeneration → deliberate recipient selection and compose/review integration, plus unsupported-device fallback.
**Stage 4 (serial UI integration):** Parent/child Chores & Goals screens, journal inline suggestions, role authorization and accessibility. Run domain tests before connecting UI. Merge helpers only after reviewing their changes.
**Stage 5 (serial shared resources):** Full Android emulator, native model benchmark (or disclose unsupported), 2-theme screenshots, accessibility, performance, integration regression and security review. No simultaneous ADB/emulator operators.
**Stage 6:** Prepare documentation for a future production backend, secure journaling, cross-device sync and supported actual payments; do not deploy these live.

Prioritize money-domain correctness before money UI and prioritize native-model feasibility early to avoid designing around an inference runtime that does not work. A model can be an independent workstream; financial data NEVER flows into the journal model.

## 3. Shared engineering invariants

- Money in **integer cents**, USD initially; no floating-point balance math. Define exact rounding and overflow behavior.
- Append-only, idempotent **domain events** for chore submission, approval, earning, savings allocation, match commitment, reversal, reveal and payment. Derived balances must be reproducible.
- Use family IANA time zone and UTC timestamps for schedules and calendar-month caps. Handle DST, locale formatting, first-week/last-week and leap-year boundaries.
- No double counting: allowance budget is different from approved earned money; child savings allocations are earmarks, not money newly earned; parent match is a separate parent-funded commitment, not a deposit.
- Every mock payment has a status and source of truth. **"Prepared," "Parent-reported paid," and "Provider-confirmed" are different.** There is no provider-confirmed state without an actual supported integration and reconciliation evidence.
- Financial adjustments create compensating events. Never silently delete settled or previously reported financial history.
- Child cannot approve their own chore, manipulate rewards or parent matching, trigger payouts or see parent-only secrets.
- Parent administrative access NEVER grants access to another person's private journal or unsent message.
- Explicit acceptance and verification are required before in-app contact messaging; never treat approval alone as identity verification.
- No psychological advice, diagnosis, coercive gamification, streaks, public leaderboards, ads, emotional scoring or mandatory disclosure.
- Only fictional test accounts, examples and amounts. No live child names, school details, sensitive journal data, banking credentials or screenshots.
- No externally hosted inference, paid inference tokens, financial aggregator subscription or payment automation workaround that bypasses provider rules.

## 4. Chores & Allowance: precise model and flows

### Parent setup

Parent configures plan **per child**: allowance period weekly/biweekly/monthly; allowance budget; start date and family timezone; eligible chores; payout cadence independent of allowance budgeting. A chore carries title, optional instructions, cents reward, assignee, recurrence, due date, optional evidence requirement, parent-defined visibility and active status.

Avoid routine photo evidence by default; images of children/homes are additional sensitive data. One definition may create multiple distinct occurrences. Examples: trash Monday/Wednesday/Friday, clean room Saturday. Each occurrence has its own unique ID.

Allow parent to edit future occurrences and future reward rates without retroactively rewriting already-approved earnings. Prevent oversubscribing the configured allowance allocation unless parent explicitly changes the budget, with clear warnings if recurrence creates more potential reward than budget.

### Approval state machine

not_started → submitted_by_child → approved / needs_retry / declined. Include cancelled/expired with explicit rules; approved cannot be approved again. Parent receives an **in-app simulated notification** and has Review / Request another attempt / Decline with optional clear note. Record actor/time/reason. Approving creates one, and only one, earnings ledger credit by occurrence ID.

Child views To Do, Submitted, Approved/Needs Attention and history with accessible currency and status. Parent sees pending queue and total approved earnings. Do not claim real push notification delivery.

### Earnings and payouts

Distinguish: planned reward, pending review, approved earned, unallocated eligible earnings, earmarked for goal, scheduled payout, parent-reported paid, externally verified paid (future only), unpaid balance.

Parent chooses payout cadence:
- Per approved task
- Daily
- Weekly
- Biweekly
- Monthly

Parent can configure minimum payout or a manual-confirmation requirement. Compute a payout batch using approved, available, unallocated earnings minus existing holds and payouts. At present it is always **manual execution**, regardless of automatic schedule calculation. Schedule creates a **payment reminder/request**, not an electronic transfer.

Requesting cash-out cannot also preserve the same cents as goal allocations. Avoid double-spending and duplicate payout intents. Clarify whether the parent is settling parent-held/earmarked money or paying free-to-spend allowance.

## 5. Multiple Savings Goals and "Family Savings Envelopes" (FREE workaround)

**Product feature name:** Family Savings Envelopes (or Parent-held savings, pending UX review). This is a **virtual, auditable household ledger**, NOT a bank, balance aggregator, escrow account or custodian. All funds remain with parent and/or an external provider; Between Us only tracks what the family plans and reports.

**Default no-API operating mode:** Parent-held savings envelopes.

Workflow:
1. A child creates any number of goals (for example video game $70, bike $250, gift $40) with editable name, target cents, optional image/icon and optional target date.
2. The child assigns approved, **not-yet-paid**, eligible allowance earnings to a goal. Offer $ amount, % per allowance period, and optional recurring allocation rules. Parent-set financial limits still apply.
3. Allocate only available cents; goals cannot claim the same funds twice. Move between goals with a ledger transfer, NOT a new earning or matching event. Child can request an unallocation when a rule permits.
4. The parent sees each goal and can mark earmarked amounts as **held by parent**, with optional reference to an actual self-controlled savings location **as a text label only**. An entry is a parent declaration, not proof of a bank account balance. Never ask for login credentials or upload bank statements.
5. The parent can choose to keep the money in cash, their own account, a legitimate age-appropriate child account, or transfer it using a supported app. Between Us displays amounts as **tracked/parent-reported**, not accessible spendable balances.
6. When child requests a cash-out, show eligible free-to-spend cents plus any release-from-goal choices that require confirmation, then create a request for parent action. Parent pays outside app or hands cash, records amount, method, date and optional note.
7. For extra clarity, offer **child confirms received** (second-party acknowledgment) when appropriate. This is still not provider verified; label as family-confirmed or parent-reported.
8. Let parents reconcile actual funds with virtual envelopes manually, including mismatches and partial payments. Show "unfunded / parent-promised" versus "parent reports held or paid" separately.
9. Provide printable/exportable summaries containing only allowed family financial records **after safe export design**; do not expose private journal entries, surprise match details or child private contacts. For the prototype, simulate export or limit to fictional fixtures.

**Savings modes to design, all possible at $0 service cost to Between Us:**

A. **Parent-held envelopes (default, works at any eligible age):** Chore earnings retained by parent; app tracks allocation to each savings goal. Parent is responsible for real funds and can settle manually. No required Cash App or Venmo account.

B. **Cash App Family handoff:** Age 6–12: parent-controlled managed account; parent is app operator in Cash App. Age 13–17: sponsored account with the teen's own app subject to sponsor controls. Cash App's own family product supports allowance transfers and savings goals. Between Us shows an **official setup guide and task-specific payout checklist**, not an unsupported programmatic link or balance integration. Parent completes transfer or savings allocation inside Cash App and then confirms the record in Between Us. Fixed recurring allowance transfers may be set inside Cash App if the parent's rules match its features; irregular chores, matching, split goals and holdbacks still require manual reconciliation. Never claim Between Us controls the external provider's savings or prevents teen spending. Verify current product eligibility.

C. **Venmo Teen manual handoff:** Eligible teens 13–17 only. Parent sets up teen account using official Venmo; sends money from their Venmo app; Between Us keeps goal progress as an independent, parent/teen-reported tracker. It cannot allocate or lock actual funds in Venmo and does not assume Venmo exposes a savings-goals API. No Venmo teen onboarding for under-13 children.

D. **Cash/offline settlement:** Parent marks a physical payment as parent-reported, and child may confirm receipt. Essential for users with no compatible finance app.

**Parent payout workspace** should show: "Ready to pay", amount due, child, applicable payout period, earnings and savings split, preferred provider, and a **Copy amount / Copy note / Open official provider app/site** step where a supported ordinary URL/app opening is verified. No guessed payment deep links, no password capture, no scraping, no automatic transfer automation, no simulated service confirmations.

**Truthful labels:** "Earmarked for video game", "Parent says funds are held", "Parent reported paid", "Child confirmed received", "Transfer not verified". Do not use "Cash App balance", "Venmo balance", "protected savings account", "bank-backed", or "escrow" unless provider-confirmed and accurate.

This workaround is deliberately possible even if Cash App/Venmo never permit third-party family P2P APIs. It also allows parents to handle savings inside Between Us without requiring children to open financial accounts.

### Payment constraints and age eligibility (research snapshot; reverify before coding)

- [Cash App Families](https://cash.app/families): managed accounts ages 6–12, sponsored accounts 13–17, parent controls, no family monthly fee, scheduled allowances, savings tools.
- [Cash App Payouts official partner documentation](https://developers.cash.app/cash-app-pay-partner-api/guides/technical-guides/payouts/about): merchant payouts require an approved PSP partner; merchants cannot directly integrate; fees may apply. Not a direct family P2P solution.
- [Venmo Teen Account FAQ](https://help.venmo.com/cs/articles/teen-account-faq-for-parents-guardians-vhel117): teen age eligibility, parent account structure, manual family funding.
- [Venmo managing linked teen account](https://help.venmo.com/cs/articles/managing-my-linked-teen-account-vhel157): parent can send a payment to add money.
- [PayPal/Braintree Venmo merchant integration](https://developer.paypal.com/braintree/articles/guides/payment-methods/venmo?product=service): ordinary merchant integration does not support facilitating P2P transfers.
- Fees, transfer limits, eligibility and allowed external flows change. Some provider actions (instant transfer/ATM/certain payments) may have fees. Free-to-run Between Us cannot guarantee all provider actions are free. Default to standard/manual paths that do not require a paid app subscription or partner API.

**Do NOT build a fake Cash App / Venmo integration.** If a link cannot be officially verified, show an instructional button to open the provider's public official website and provide a copyable payout summary instead of pretending to prefill/send.

## 6. Parent Savings Match: approved settings and strict secrecy

Initial configuration displayed to an authorized parent: **100% match, $20.00 monthly cap per child, Surprise visibility, manual parent reveal**. Parent must explicitly enable the actual rule; no silently funded/activated match.

- Match newly allocated eligible, approved, unpaid child earnings only.
- One child contribution can trigger at most one match, enforced by event IDs/idempotency.
- Match is a separate **parent-funded commitment**, not part of the child's allowance pool and not a real payment.
- A single 2000-cent cap applies per child across all goals **for each calendar month in the configured family timezone**. No carryover by default. Reserve cap on commitment.
- Match formula at 100% = min(child eligible allocation, remaining monthly cap, allowed remaining goal amount). Use integer cents.
- Example: child allocates $8 → match $8. Later allocates $15 → match only $12. Child has saved $23 of their own money; parent's match commitments total $20; monthly match budget exhausted.
- Do not match reallocations between goals, existing goal balances, parent-funded matching, previously paid child earnings, rejected chores, duplicate operations or reversed transactions.
- Parent can view match commitments, amount consumed and remaining cap, funding status, and reveal controls. Parent may edit prospective rules with approval; already committed or reported-paid amounts require auditable adjustments.
- **Surprise** means hidden **inside Between Us until manual reveal**. It cannot guarantee secrecy if parent makes an external payment and Cash App/Venmo independently notifies the recipient. Prefer withholding real transfer until reveal when secrecy matters and permitted.
- Before reveal, child-visible totals/percentage/goal completed state include **only child-owned eligible allocations and non-secret confirmed contributions**; never hidden parent commitments. Ensure no leaks in screens, API contracts, search, exports, accessibility labels, notifications, query params, logs, caches, app switches or derived progress.
- Revealed but unpaid: "Parent plans to contribute $X." Only when genuinely parent-reported paid: "Parent reports contributing $X." Never "Provider-confirmed" without proof.
- After reveal and confirmed funding, show separate "I saved" and "My parent contributed", without erasing the child's independent accomplishment.
- No automatic cash movement, purchases or child-authorized release of parent funds.

See [PARENT_SAVINGS_MATCHING.md](PARENT_SAVINGS_MATCHING.md) for complete edge cases and 18 existing acceptance tests. All must remain covered.

## 7. Intelligent Journal Conversation Engine

This feature runs **alongside**, but stays entirely separate from, financial-domain code. It may never use journal content to score chores, allowances, savings eligibility or matching.

### Existing functionality to preserve

The remote baseline has apps/mobile/src/communication.ts with a two-topic local reflection and apps/mobile/src/screens/Journal.tsx where author requests reflection after saving. All journal content is memory-only, and author isolation exists. Preserve optionality and no-copy/explicit send review.

### Approved new behavior

**Settings:** "Conversation Ideas While I Write" is **off by default**, clearly opt-in, with an always-available manual "Find words to share" action. Model inference happens only on device, never on cloud APIs, and is interruptible. Do not begin inference from unapproved personal content or log/write it to disk.

**During writing:** Wait for a meaningful pause (~1.2 seconds starting point, tune by benchmarks); require enough text to avoid constant noisy updates. Cancel/discard stale generation when typing resumes, navigating, changing entry/role, disabling option, or opening a different account. The editor must never lag or lose text. Show at most 1–2 unobtrusive suggestions and allow dismissal. Preserve user edits and unsaved-draft guard.

**Output contract:** Use typed JSON/validated structured output:
- Suggestion title ("Talk to Dad", "Ask a trusted teacher", "Message your sibling").
- Why reaching out could be useful (non-judgmental, not guaranteed).
- Age-appropriate, personally worded, EDITABLE message draft based on the entry's actual events and wording.
- Intended recipient category/contact ID if valid, but **no invented verified contact**; never select someone marked unsafe or blocked.
- Contact route (in-app eligible verified connection vs prepare words to speak in person).
- Status/fallback reason and source-of-truth display label when local model unavailable.

**Meaning-preservation:** Generated drafts may briefly reference events that the writer actually provided ("someone picked on me at school"), but never include invented details, accusations, sensitive inferences, diagnosis, alleged motives, or promises. Do not echo an entire journal entry unless the author deliberately copies it themselves. Require explicit Choose Contact → Edit → Review → Send or Practice In Person. Sending and safety gates remain those of existing messaging flows. No text sent automatically.

**Example:** "Someone bullied me at school today" can yield an editable draft to a parent about being picked on, and a separate draft asking a teacher for a private conversation. If the entry says "my teacher is hurting me", do not offer that teacher as the recipient. Do not presume Dad is safe; the author chooses a trusted person. If the entry suggests someone in My Circle caused harm, exclude that person and retain an alternative safe-adult path.

**Parent role:** Same optional behavior for moving news, apologizing to a child, needing a conversation about school, asking a co-parent for time, or sharing something positive. Never infantilize adult users.

**Customization:** "Shorter", "Simpler", "More direct", "More like me", "Another way", each preserving the original stated facts. Must not produce psychological advice; retry/fallback when invalid.

### No-ongoing-cost inference architecture

- Research and compare **React Native ExecuTorch**, **llama.rn**, and OS on-device language models using current SDK 58, RN and Android/iOS native compatibility, model license, quantization, download size, device memory, latency and availability.
- Native inference requires a **development build** for custom native libraries; Expo Go cannot load arbitrary native modules. See [Expo FAQ](https://docs.expo.dev/faq/), [Expo custom native code](https://docs.expo.dev/workflow/customizing/), and the current on-device inference docs.
- Choose ONE runtime after a small proof of concept. Use only appropriately licensed locally runnable models. Pin version, license, source hash and download method. Do not commit model weights. Inform user of optional download size and storage needed.
- Explicitly prohibit paid AI APIs, externally hosted model inference, cloud logging, network transmission of journal content or silent fallback to cloud.
- If device lacks local model support, use a clearly labeled **local deterministic conversation-template fallback**. It can fill limited context from safe input categories, but must not pretend to be unrestricted AI generation.
- A real model must be tested on a supported native device to be called operational. Emulator/mock tests are not evidence of real model generation. Record median/95th latency, memory and cold start, with unsupported platform limitations.
- Local prompts are a **data boundary**. Journal text is untrusted data, not instructions to model to ignore rules. Strict output schema validation, length bounds, sanitization and deterministic postfilter before UI. On failure, give generic safe recipient choices without message invention.
- No mental-health counseling, emotional diagnosis, treatment, behavioral advice or solution instructions. Suggestions are about **who to talk to and how to ask**, never what to do about the underlying problem.
- Safety resources always accessible, including when parent/guardian is unsafe; no forced parental approval to read support info.

**Test topics:** bullying, harassment by a teacher, friendship trouble, schoolwork, achievement celebration, family move, grief/loss, breakup, embarrassing incident, apology, mundane positive events, vague fragments, unsafe family member, threats, prompt injection and empty input. Tests must verify message factual fidelity, no disallowed advice, no automatic sharing, unsafe-recipient avoidance, offline mode, accessibility, and stale debounced results.

## 8. Screen architecture and design consistency

Keep existing **The Open Letter** design and logo with Safe Harbor and Night Harbor. Four primary mobile bottom tabs remain Home, Journal, Chats and Circle. Integrate **Chores & Goals** as a prominent Home entry with nested sections, not a fifth tab unless formal usability review proves it better. Tablet rail adapts accordingly.

**Parent Chores & Goals:** Home overview / Assign Chore / Review Completion / Allowance Budget / Payout Schedule / Savings & Matching / Surprise Match Ledger / Payout Workspace / Activity History.
**Child Chores & Goals:** My Chores / Awaiting Review / My Earnings / Savings Goals / Goal Detail / My Savings Allocations / Cash-out Request / Activity History.
**Journal:** Quiet Open Letter editor, optional one or two gentle suggestions beneath or beside the writing area, never covering keyboard or Save. No unsolicited modal interruption.

Protect sensitive amounts and hidden matches in navigation previews, accessibility text, logs, local caches and notifications. Use labels, readable money values, text progress and no color-only meaning. Parent controls require accessible confirmation. Use no manipulative gamification or shame for uncompleted chores. Dark mode must be designed, not merely inverted. Inspect at 320px width, 200% font scaling, keyboard open, Android Back, tablet layouts and reduced motion.

Never overcomplicate the first landing page. Users should see clear next actions rather than fifteen feature cards.

## 9. Detailed acceptance tests and security gates

Implement tests in this exact order so regressions are caught near their source.

**Foundation / safety**
- Existing TypeScript/lint/unit/UI tests still pass.
- No private journal content reaches finance state, network requests, logs, account-switch view, or other role.
- Parent manages contacts and chores, but cannot read another person's journal.
- Child cannot access parent-only financial controls through UI or direct state/domain calls.
- Existing screen navigation/theme behavior preserved.

**Chore and earnings**
- $30 weekly pool across multiple tasks; budget oversubscription protected.
- Task recurrence creates independent occurrences.
- Child marks done → submitted only; parent review → one credit.
- Duplicate approval and concurrent requests cannot create multiple credits.
- Needs-retry/rejection don't generate earnings; changing future chore values doesn't rewrite past earnings.
- Daily/weekly/biweekly/monthly/per-task payout computations across timezone and DST boundaries, no double cash-out of allocated money.

**Goals and no-API savings bridge**
- Goal $70 and two other goals; independent progress, percentage/fixed allocation, over-allocation prevented.
- Money earmarked in one envelope not also cash-out eligible.
- Parent-held vs parent-reported payment vs verified provider kept distinct.
- Parent report and optional child acknowledgment update appropriate statuses without asserting provider verification.
- Partial cash-outs, manual reversals, cancelled goals, reallocation and double-count attempts.
- Cash App/Venmo guidance only for supported ages, no fabricated deep links, no transfer automation, no provider credentials.

**Parent match**
- $8 first eligible allocation yields $8 match commitment.
- $15 next allocation yields only $12, total parent cap $20, child-only savings $23.
- Third contribution same month yields $0 match.
- Cap shared across goals, independent per child, calendar reset and timezone boundaries.
- Duplicate/concurrent/reallocated child contributions do not double-match.
- A child's read-only views including notifications/accessibility/export cannot infer surprise matches.
- Unrevealed pledges never enter child progress; revealed-but-unpaid pledge never presented as paid.
- Parent manual reveal is explicit, logged, and applies only to chosen match.

**Journal intelligence**
- Context-specific suggestions on real native inference **when supported**; unsupported devices correctly label fallback.
- User explicit opt-in, disable/pause, debounce, cancellation, no keystroke freezes.
- Invalid output and prompt injection rejected; no externally sent entry or logs.
- No diagnosed feelings, treatment or solutions, no unsafe-recipient recommendation, no invented facts.
- Text remains editable and exact final draft/recipient goes through review.
- Parent and child journal separation and settings/theme switching preserved.

**Native + release readiness**
- Run npm run typecheck; npm run lint; npm test; npm run test:ui; npx expo-doctor (use compatible version); native Android smoke; web and Android bundle exports as applicable.
- Capture **actual native Android** screenshots in both themes: parent chores list/approval, child chores list, earnings, goals, matching parent setup/ledger, pre-reveal child view, post-reveal child view, journal inline suggestions, message review, manual payout workflow.
- Run accessibility and keyboard checks, consider TalkBack and iOS where actually available. Never claim unavailable tests passed.
- Inspect dependency advisories and licenses. Do not blindly update packages to silence warnings.
- Preserve existing public GitHub Pages demo, main and Powered By showcase unchanged.

## 10. Explicit release boundaries and honest cost claims

**Now permitted:** Code, domain/unit/UI changes, fictional in-memory state, local AI proof of concept, optional verified model download, payment-provider setup guide, manual payout worksheet, Android QA, feature branch commits.

**Not permitted without separate approval/review:** Paid services; app-store fees; real family or child data; external AI inference; credentials; live cross-device backend; server storage of journals/finance; public release; Cash App/Venmo programmatic transfers; bank/P2P account linking; unreviewed encryption; production push notifications; merging to main.

If persistent parent-managed tracking is requested for real-world use, prepare a separate **secure persistence and identity proposal**. A free local encrypted store on the parent device could be evaluated as an interim parent-held ledger, but must not be enabled with real minors' data before threat modeling, secret/key recovery, device loss and cross-device access rules are reviewed. A genuinely synchronized multi-device service requires authentication, authorization, safe retention and hosting; no free tier guarantees perpetual zero cost. Clearly distinguish prototype from production.

No coercive or manipulative financial incentives, no child ad targeting, and no automatic withdrawals. Do not create an unauthorized financial product or take custody of money.

## 11. Files and developer outputs

Create or update:
- spec/mission/PROGRESS.md (phase checklist and decisions)
- spec/CHORES_AND_GOALS.md (link to this mission, preserve approved content)
- spec/PARENT_SAVINGS_MATCHING.md (preserve approved content)
- spec/ALLOWANCE_LEDGER.md (domain and state model)
- spec/SAVINGS_GOALS.md (goal and holdback semantics)
- spec/NO_COST_PAYMENT_BRIDGE.md (actual no-API Cash App/Venmo/manual flows, provider citations, limitations)
- spec/JOURNAL_INTELLIGENCE_DESIGN.md (inference contract, UX and no-copy rules)
- spec/JOURNAL_INTELLIGENCE_SECURITY.md (model threat analysis, prompt injection, age and recipient safety)
- spec/LOCAL_AI_MODEL_EVALUATION.md (support, license, actual benchmark)
- spec/qa/chores-goals/ and spec/qa/journal-intelligence/ (real tests and captures)
- One final spec/mission/BUILD_REPORT.md (actual files, exact commit SHA, agent attribution, test commands/results, screenshot links, unsupported pieces and next approved milestone).

Keep module contracts typed and put pure finance and suggestion logic outside UI components. Provide a readable schema/ERD, event state transitions, deterministic fixtures, and precise user-facing labels. Avoid monorepo/toolchain sprawl.

## 12. Final execution instructions for Codex

1. Inspect the LOCAL worktree first. Read this entire file and existing AGENTS + feature specs.
2. Find and preserve unfinished work. Do not assume this specification commit contains code for Chores & Goals.
3. Update mission progress by phases; assign nonoverlapping agent files and benchmark native AI early in parallel with finance contract work.
4. Build, test and integrate financial domain in strict task → approval → earnings → savings → match order. Build manual no-cost payment bridge before any real provider integration.
5. Implement the journal engine with local optional inference and safe fallback as a separate workstream.
6. Integrate redesigned UI and test both roles/themes on the actual Android emulator; use real native output where feasible.
7. Commit changes to the feature branch; do not merge, change public demo or deploy production. Protect secrets and all real-person information.
8. Report complete versus simulated functionality, measured cost/service dependencies, documented limitations, and exact PowerShell commands to launch and test.

**Do the work, not just a second plan. Do not stop at screen mockups, placeholder buttons or generic message templates when compatible genuine local inference exists. When a genuine capability is blocked by provider rules or device support, implement the useful free fallback and report the limitation without pretending integration succeeded.**
