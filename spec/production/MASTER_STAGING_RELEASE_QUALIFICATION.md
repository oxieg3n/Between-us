# BETWEEN US — MASTER PRODUCTION STAGING & RELEASE QUALIFICATION MISSION

> **Execution authority:** Implement and verify the entire authorized engineering scope in dependency order. Prepare an evidence-backed release candidate for the owner's go/no-go review. **This is not permission to activate public enrollment, collect real children's data, spend money, publish an app, or assert legal/security certification.** Where an external approval or physical resource is unavailable, prepare everything possible using fictional accounts, record the exact blocker and continue independent work.

| Item | Baseline / approved decision |
| --- | --- |
| Product | Between Us, by Powered By Oxieg3n |
| Windows workspace | `D:\projects\BetweenUs` |
| GitHub | https://github.com/oxieg3n/Between-us |
| Starting branch | `feature/production-foundation` |
| Initial verified remote commit | `53f7ebef85459eaa986d1bad4b6c797a1d2dcc9c` |
| Baseline | `1116-ProductionFoundation-p3`, mobile 0.4.1, backend 0.1.0 |
| Canonical live backend target | **Supabase Free** (owner's selected launch infrastructure) |
| Alternative backend investigation | **Out of scope** unless Supabase is demonstrably unable to meet a mandatory security/functional requirement |
| Other infrastructure | Existing owner-controlled resources and free, officially supported services only, where needed and separately approved |
| Staging data | Synthetic identities and fictional content only |
| Public launch | **Disabled until explicit owner sign-off and independently completed legal, child-safety and security gates** |
| Brand | The Open Letter; Safe Harbor and Night Harbor, approved logo and exact official tagline |
| Payment boundary | Family Savings Envelopes/manual payout reporting; never real automatic Cash App/Venmo transfers |
| Journal boundary | Author-only device-local encrypted journal; no cloud journal content, AI prompts or model outputs |

## 0. Non-negotiable instructions and sources of truth

Before any code or deployment, read in full:

1. Root `AGENTS.md`; `apps/mobile/AGENTS.md`; `services/backend/AGENTS.md`.
2. `spec/production/DELIVERY_RECEIPT.md`, `ARCHITECTURE.md`, `SECURITY_REVIEW.md`, `RELEASE_CHECKLIST.md`, `TEST_RESULTS.md`, `SUPPORTED_DEVICES.md`.
3. `spec/production/CHILD_PRIVACY_COMPLIANCE.md`, `JOURNAL_STORAGE.md`, `COST_ANALYSIS.md`, `BACKEND_COMPARISON.md`, `runbooks/LOCAL_AND_CI.md`, `release/production-checks.workflow.yml`.
4. `spec/security/BOUNDARIES.md`, `spec/mission/PRODUCTION_RELEASE_GATES.md`, `design/OPEN_LETTER_DESIGN_SYSTEM.md` and current store policy drafts.

**Latest owner decision overrides a generic provider-selection exercise:** Supabase Free is the selected intended launch provider. Keep Supabase Auth/Postgres/Edge Functions/Realtime as the existing authoritative architecture; optimize within Free limits. Do not spend cycles rebuilding the system on Cloudflare, Firebase or a self-hosted auth provider merely to compare options.

**What p3 already accomplished:** Local Supabase authentication and 24 migrations, 926 SQL assertions in 19 files, 55 backend tests, 260 mobile tests, 11 local integration scenarios, 16/19 production/demo browser scenarios respectively, and scoped actual Android debugging with fictional accounts. A documented clean post-keyboard check passed. This is a **local** production-style foundation, not a hosted, signed, independently reviewed or child-ready service. Preserve these passing tests and historical evidence.

Inspect local Git branch/status, worktrees, origin, HEAD, unpushed changes, the deliberately untracked diagnostic, installed SDK, packages, permissions and existing services. The local working copy might be ahead of this document. Never overwrite unfinished work, force-push, reset, or silently delete data. Use `git -C 'D:\projects\BetweenUs'` for all Git work. Create an appropriately named release-qualification feature branch from the latest verified `feature/production-foundation` state **only after reconciling local work**; use `feature/staging-release-qualification` unless it already exists. Do not merge to main or modify `docs/` or the public Pages demo.

## 1. Free-plan operating contract: build for launch on Supabase Free

**Treat Supabase Free as the intended launch tier.** Design, benchmark and set measurable guardrails for its actual limits, not abstract future scale.

At the time this mission was prepared (2026-11-16), Supabase's published Free pricing advertises approximately:

- **2 active Free projects** across eligible organizations; reserve one for owner-approved hosted synthetic staging and one for owner-approved production when appropriate; local Docker stack is separate. Never create a third paid project by mistake.
- **500 MB database quota/project**, **50,000 monthly active users**, **5 GB egress** plus published cached egress, **1 GB file storage**, **500,000 Edge Function invocations**, **2 million Realtime messages**, **200 peak connections** and shared compute. Reconfirm directly on Supabase before provisioning; don't interpret quota as an availability guarantee.
- **Inactivity pause**: Free projects may be paused after approximately one week with insufficient actual database activity. Do not promise continuous availability from the Free plan or fabricate keepalive activity to evade provider restrictions. Monitor real traffic and prepare pause detection/restoration and transparent user-facing degraded states.
- **No managed automatic daily backups/PITR** on Free. Use a properly secured **manual/scheduled logical backup plan using supported Supabase CLI/PostgreSQL tools**, encrypted off-platform storage and genuine restore drills. Implement only with approved credentials/destinations.
- **Default Supabase Auth email service is not production delivery**: currently limited to pre-authorized team addresses and roughly **2 messages/hour**. Production sign-up/recovery requires separately approved **custom SMTP or an official Send Email hook** with actual delivery tests, SPF/DKIM/DMARC, domain ownership, abuse controls, clear quotas and an eligible free allowance where available. Do not disable email verification to bypass restrictions.
- Prefer no paid account, no consumption overage, no credit-card billing activation, and **no silent paid fallback**. If a vital function cannot safely work for free, document an exact budget/approval gate instead of simulating it.
- No cloud AI inference; journal model remains local. No financial API subscription. No paid SMS dependency unless separately approved.

**Official source links to verify before implementation:**
- [Supabase current pricing](https://supabase.com/pricing)
- [Supabase usage and Free quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Database backups and recommended CLI exports](https://supabase.com/docs/guides/platform/backups)
- [SMTP for Supabase Auth](https://supabase.com/docs/guides/auth/auth-smtp)
- [Hosted Auth flows/rate limits](https://supabase.com/docs/guides/auth/testing-auth-flows)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)

### Required Free-tier capacity/availability work

1. Implement a repeatable **quota and capacity model**: per-family projected tables/indexes and retention, write rate, transactions, message size/history, concurrent Realtime sessions, auth MAUs, API/functions, egress, and support cases. Use realistic conservative scenarios (for example 10, 100, 500, 1,000 families) as **estimates**, not asserted hosting capability.
2. Add **server-side safety limits**: payload size, paginated retrieval, bounded Realtime hints, per-actor/family rate limits, retry caps, spool limits, notification batch limits, and circuit breakers. No destructive behavior at quota thresholds.
3. Implement resource telemetry **without message contents, journal text, contact secrets or child financial details**. Distinguish usage warnings from hard request rejection; choose approved thresholds and escalation recipients.
4. Define graceful degradation: cached public safety resources, honest read-only/outage states, unsent message/outbox recovery, journal local availability and financial changes blocked during server outage. Never display an unconfirmed send/earning/payout as completed.
5. Implement a Free-tier **cost/limits acceptance dashboard** and daily/weekly review runbook. Test projected quota exhaustion locally and show exact owner action if Supabase requires a paid upgrade. No paid changes automatically.
6. Include formal **RPO/RTO** goals and a viability assessment for Free-tier availability. A child-safety service cannot claim guaranteed uptime; safety resources must not rely on a backend being available.

## 2. Execution order and agent ownership

Execute without idle phase-by-phase permission requests for ordinary, authorized engineering. Create `spec/production/staging/PROGRESS.md` with phase checklist, owner decisions, exact results and blockers. Assign distinct files to specialist agents.

| Phase | Lead | Must finish before |
| --- | --- | --- |
| A. Baseline, contracts and risk register | Master + Security | all changes |
| B. Free-tier readiness, reproducible environment configs and safe deployment plans | Staging/DevOps + Cost | hosted staging |
| C. Hosted synthetic staging provisioning **only after owner approval** | DevOps + Auth | hosted delivery and provider tests |
| D. Staging migrations/RLS/realtime/SMTP and auth callback validation | Backend/Identity | actual cross-account messaging and hosted UI |
| E. Backups/restore, deletion/retention, incident operations | Database/Privacy/Safety | release gate |
| F. Native security, push and physical-device qualification | Mobile/QA/AI (in parallel with D/E) | signed release |
| G. Child consent/legal and safety operating program | Privacy counsel/operator preparation and code (parallel) | public enrollment |
| H. CI/CD, release signing/store metadata and final red team | QA/Release/Security | candidate acceptance |
| I. Final freeze, rollback/go-no-go | Master/Owner | any production rollout |

**Prioritize high-risk backend authority, restoration and personal-data safety over UI polish.** Do not take down or reset a working local Supabase stack to make tests easier. Serialize Git integration, active migrations, package changes, device/ADB access and environment provisioning. Specialists review each other's security-sensitive work; reviewers are **not** independent third-party auditors.

## 3. Phase A — reproduce and harden baseline

- Re-run typecheck, lint, mobile/backend units, 19 pgTAP files, local Auth/realtime integration and 16/19 production/demo browser scenarios in a controlled environment; preserve true source hashes, exact command outputs and timings, and any failures. Never add historical counts to new counts.
- Inventory deployed/tested migrations `001–024` and pending migrations; test both fresh install and upgrade, rollback strategy, RLS enablement and grant paths.
- Confirm critical code paths: distinct child identities, server authorization, recipient acceptance + independent verification, bidirectional blocking at send/fetch/subscription, client-UUID idempotency, finance transaction CAS and hidden matching equivalent-world privacy, neutral notifications and confidential report access.
- Test malicious callers directly at SQL/API/Realtime boundary (cross-family IDs, forged role, revoked sessions, replay, stale/offline completions, changed-body idempotency key reuse). UI-hidden buttons are NOT authorization.
- Correct the observed Night Harbor **white square logo backplate** where possible without redesigning approved brand art or lowering contrast. Re-test both themes and actual Android. No unnecessary rebrand or generic UI.
- Make every production/synthetic status label true, especially Hosted vs Local, Report queued vs handled, Parent-reported financial transaction vs external provider verified, Consent requested vs independently verified.
- Reconcile exact auth callback scheme/deep-link allowlists, migration/stack versions, device permissions and release service paths. Do not silently enable unsupported runtime modules.

## 4. Phase B — reproducible, safe configuration for staging and eventual production

Maintain THREE isolation levels: **LOCAL** (existing Docker, synthetic), **HOSTED STAGING** (separate approved Supabase Free project, synthetic), **PRODUCTION** (separate approved Supabase Free project, disabled pending owner sign-off).

- Create env templates with **variable names only**, secured local files ignored by Git, strict runtime schema validation, no secrets printed/logged, and a credential-rotation plan. Supabase anon/publishable key is not a privileged key; service-role/secret keys remain server-only.
- Implement version-pinned, repeatable one-command **preflight** and **manual deployment** scripts with dry run, explicit target confirmation, environment fingerprint/project-ref allowlist, migration SHA inventory, no accidental local->production misrouting, and fail-closed default. Never print credentials to terminal/report.
- Separate test data, Auth allowlists, OAuth/email callback routes, CORS/origins, mobile app-link domains, push environments, notification tokens and staff case queues. Production must reject synthetic staff/consent bypass flags.
- Use **at most two active hosted Free projects**, after checking current ownership/limits. No blind account creation, linking paid billing or changing DNS.
- Prepare local operator credential handoff instructions (dashboard steps/secret injection) for the owner. Do not ask the owner to paste passwords or service keys into Codex/chat/GitHub.
- Install/activate the existing GitHub manual CI template only with **explicit owner permission and an authorized credential with workflow scope**. Review pinned actions and free runner quota first; do not bypass permission errors, create a new privileged token, add unapproved automatic PR/push triggers or claim CI executed when it was not.
- Provide production-like **dry-run/staging only** rollback, migration canary and incident-response scripts, explicitly requiring human approval before a live production migration.

**Hosted project creation and any network deployment are explicit authorization gates.** If not granted, prepare tested artifacts, simulate with the official local stack, record the owner's exact click/CLI steps, and continue the rest.

## 5. Phase C/D — hosted Supabase staging acceptance

When owner approves a synthetic-only hosted Free staging project and provides secrets through approved protected channels:

1. Validate project, region, plan = **Free**, current quotas, credentials/redirect URLs and staging hostname. Do not activate public child registration or accept real family details.
2. Apply reviewed migrations in order with a recorded schema/migration manifest. Validate fresh install, upgrade and rollback semantics before production.
3. Configure and validate independently scoped Auth identities: parent account, separately credentialed child/teen, second guardian, unrelated family, trusted teacher/adult, reporter and operator. All fictional.
4. Verify **age/consent policy stays deny-by-default** absent owner-approved VPC/age/state policy. Local synthetic fixtures MUST NOT become public signup rights, operator authority or contact verification.
5. Execute real hosted API/Auth/Postgres/RPC access tests for intended users plus malicious clients, untrusted metadata, revoked sessions, stale JWTs, consent withdrawal, shared devices, changed roles and cross-family access.
6. Verify hashed single-use invitation acceptance; expiring claims; separate trusted-person verification; two-way blocking and revocation at send/fetch/Realtime event; no broadcast private message bodies or raw ledger.
7. Run **real staged multi-device or dual-session** message/send/retrieve/reconnect tests. Confirm client receipt, not just server insert; test denied delivery after block and offline retry, duplicate-send recovery, and exact user-visible delivery status.
8. Test staged transactional chores/approvals/earnings, multiple goals, manual payouts, 100%/$20 Surprise matching and all financial race/replay/rollback/privacy invariants on actual managed Postgres.
9. Ensure no child's API output or error/network timing exposes hidden matching, report details or another author's journal. Do not create backend journal read endpoints.
10. Verify SMTP recovery/invitation/delivery, including bounce, rate limit, token expiry, spoofed callback, DKIM/SPF/DMARC, and privacy-safe templates once a compliant sender is available. Built-in default SMTP is NOT a production substitute.
11. Make rate, abuse and quota exhaustion tests bounded enough not to overwhelm a hosted free project. Use local stack for adversarial load, hosted only low-volume proof within quotas.
12. Capture staging QA evidence, trace IDs, actual outcomes, public safety resource access and exact SHA/commit/config version **without exposing credentials, private details, email addresses or children**.

Hosting remains synthetic-only until *all* applicable external gates pass.

## 6. Phase E — backups, restore, deletion, retention and incidents

Free plan lacks managed daily backups, so build the **free, secure alternative as a real operating procedure**, not a Markdown wish:

- Choose a reviewed, version-compatible **logical export** method (`supabase db dump`/Postgres tools) under an owner-controlled scheduled host or approved free storage with encryption **before** offsite upload. Use established authenticated encryption, not homemade crypto. Dedicated minimal-scoped credentials, protected key storage and key-rotation/recovery must be documented.
- Include metadata required for a truthful restore: schema migration state, external Auth service state and portability limits, selected non-database objects/storage, extensions, roles/policies and separately retained non-secret config. A Postgres dump alone may NOT reconstruct all Auth/storage/provider state. Inventory what is recoverable and what is not.
- Use encrypted at-rest backups, multiple recovery copies, owner-reviewed access, retention expiry and deletion tombstone replay after restore. Backups must not silently resurrect a child account or withdrawn consent.
- **Perform an actual restore into disposable isolated synthetic test infrastructure**, verify row and authorization integrity, message/finance idempotency, and deletion/revocation after restore. Measure RPO and RTO; do not claim production recovery if backups are incomplete or the restoring host is the only copy.
- Simulate corruption, partial backup, expired credentials, failed schedule, low disk, a Free project pause, mid-transaction crash and full service unavailability. Backpressure and failure states must not lose or duplicate earned money or create misleading delivered messages.
- Define finite retention per data class, consistent legal hold handling, secure deletion/export, Auth identity removal, backups, logs, device-only journal and provider integrations. Build a deletion/revocation **proof** with independent reviewer using fictional data. Do not claim cloud can erase a device-only journal it doesn't possess.
- Document incident classification, on-call/owner notification, compromised key response, service degradation, privacy breach notification workflow, backup tamper detection and user safety fallback. A static public emergency help page should function without Supabase.

A plan to run a free backup script on a Windows PC is only viable if someone actually maintains it and validates restore, encryption and offsite copies. Document the responsible operator and failure escalation.

## 7. Phase F — physical devices, iOS, local journal security and push

### Android

- Qualify at least a **physical ARM64 Android device** on realistic minimum/current versions if available, and low-memory device profile. Record actual hardware/OS, signed-like binary, ABI and permissions. Emulator screenshots are insufficient.
- Test hardware-backed key authorization and biometric failure, enrollment, invalidation, shared-device account switch, lockout, app background, process death, backup/device transfer, journal wrong/missing key, offline edit/sync boundary, 15-minute absolute lease, 2-minute idle lock, loss/recovery/export/erase, and separate outbox from journal vault.
- Test native **TalkBack** and accessibility focus/readout, 200% dynamic text, reduced motion, keyboard/IME, small/large screen, split-screen/tablet behavior where claimed.
- For local SmolLM2/llama.rn, run minimum 20 warm generations plus cold load, median/p95 latency, peak RAM, disk, thermal, cancellation/stale role, negative safety corpus and offline validated fallback. Preserve pinned model license/hash; no cloud prompts, native logs or unverified model picker.
- Inspect built APK/AAB merged manifest, signing certificate, backup exclusion, screen protection, permissions and release logs. Do not disable screenshot protection to obtain private-screen QA images.

### iOS

- If macOS/eligible physical iPhone is available, perform actual Xcode/native archive and on-device Face ID/Keychain, offline/backup/memory, notification permission/APNs, VoiceOver, dynamic type, keyboard, release logging, key loss and journal tests.
- If no macOS/iPhone exists, complete compile/static inspections and a precise hardware owner checklist, leave iOS **BLOCKED / UNTESTED**. iOS JavaScript export alone never qualifies native iOS.

### Notifications

- Implement/test provider-specific FCM/APNs registration/rotation/revocation, opt-in, quiet hours, privacy-safe payload, staff-safe case event policy, retry queues and real physical-device receipt **only after owner supplies approved credentials/project**.
- No notification may include journal text, child names, private message body, hidden match amounts, report details or sensitive finance information.
- If provider credentials unavailable, local producer/worker tests remain valid but actual push remains BLOCKED. Do not call it complete.

## 8. Phase G — legal, family privacy, age assurance and operational child safety

This is a product intended for children, including under-13, and teens. The existing [privacy register](CHILD_PRIVACY_COMPLIANCE.md) does **not** establish an approved state/age allowlist or adequate parental verification. **Do not replace guardian-managed setup with a 13+ shortcut to avoid compliance work.**

Prepare for qualified counsel and trained safety operator:
- U.S. 50-state + D.C. applicability register, with primary statute, effective date, injunction/enforcement status, service classification, current source links, explicit scope/decision/date/reviewer. Unknown/unreviewed = deny enrollment, not permanently banned. No automatic nationwide acceptance.
- **COPPA** direct notice, verified parental consent (VPC), separate consent where required, purpose limitation, retention/deletion, parental review and security program. Design a suitable independent verification flow; email or checkbox alone does not prove legal guardianship or VPC. Ensure teen-specific grant/withdrawal requirements where applicable.
- Resolve the unavoidable conflict between parental access/deletion rights for covered under-13 data and the product's promise of author-only private journals. Provide truthful, legally reviewed notices and technical options; **do not secretly implement a guardian decrypt/read backdoor**.
- Child/teen age range and transition at age of majority, family relationship and dispute evidence, false guardians, abuse by guardians, appeals, child-controlled block and alternative safe adult access.
- Consent record proof, independent reviewer sign-off, withdrawal/reconsent on material change, retention schedule, Data Safety/App Privacy mapping, account/data export/deletion and support contact.
- Written child-data security program, accountable privacy lead, risk assessments, third-party processing agreements and supplier audits as required.
- Confidential reporting workflow with **named, trained human operators**, coverage hours, case-scoping, triage and escalation, mandatory-reporting analysis, safe communication, appeal/case access, retention and staff-compromise/unsafe-guardian tabletop. Do not label local report forms as staffed/help available until operating team actually exists.
- No social feed, ad profiling, streak pressure, coercive financial rewards or publicly searchable child accounts. In-app safety resources remain usable during account/service outages.

Codex can build policies, workflow UI, evidence and operator training/runbooks, but cannot itself impersonate a lawyer, regulator, consent verifier or human safety team. Mark **OWNER / COUNSEL / OPERATOR REVIEW REQUIRED** honestly.

**Primary references:** [FTC 2025 COPPA rule amendments](https://www.ftc.gov/legal-library/browse/federal-register-notices/16-cfr-part-312-coppa-final-rule-amendments); [eCFR Part 312](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312); [Apple App Review](https://developer.apple.com/app-store/review/guidelines/); [Google Play Families](https://support.google.com/googleplay/android-developer/answer/9893335). Reverify current platform rules and full legal register before declaring supported jurisdictions.

## 9. Phase H — CI, artifacts, App Store / Google Play and third-party independent review

- Resolve inactive GitHub workflow scope **only with owner-provided authorized credentials/permissions**, install/review the existing manual CI under .github/workflows, and run a single bounded synthetic-only check after checking free runner quota. Pin actions, no secrets/artifact leakage, no automatic heavy triggers without authorization.
- Build deterministic signed **internal release-like Android** AAB/APK when owner-controlled signing material is made available through secure files/keystores outside repository. Validate certificate fingerprint, package ID, version codes, min/target API, merged permissions, debug flags, Metro absence, release behavior and actual install on hardware. No signing key in Git, scripts, logs or chat. Do not disguise a debug APK as release.
- Prepare corresponding iOS archive/signing workflows, but do not claim a signed native iOS artifact absent macOS and Apple credentials.
- Finish store listing drafts, privacy policy/Terms/retention/custody language, parental onboarding directions, help/safety/operator policy, support and account deletion URL, age targeting, data-safety questionnaires, app permissions and truthful screenshots. Real private screenshots remain protected; create approved marketing illustrations only if separately authorized and label them accurately.
- Produce dependency/native model/SDK **SBOM**, license inventory, security configuration, SAST/dependency audit, secret scan, attack-surface map, API contract tests and mobile MASVS/ASVS checklist.
- Independent security/privacy/accessibility test plan with externally verifiable artifacts, high-risk findings tracker and owner-reviewed scope. Self-run tests and assisting agents are **not an independent audit**; do not sign their findings as third-party review.
- Run release-channel install/upgrade, database migration/rollback and outage tests, then explicitly freeze version/commit/artifacts. Review unresolved moderate findings and prohibit unresolved critical/high vulnerabilities.
- Do not submit to either store, enroll beta families, activate production or publish any real child data until the owner authorizes them.

## 10. Release candidate acceptance matrix (gates, not optimistic checkboxes)

A gate is **PASS** only with a traceable exact artifact/source SHA, environment identifier, date, command/tests, factual result and assigned reviewer. Otherwise write **FAIL**, **UNTESTED**, **BLOCKED: OWNER**, **BLOCKED: EXTERNAL**, or **BLOCKED: HARDWARE**.

1. Correct latest feature branch/repository, working-tree preservation and r12/p3 regression parity.
2. Free-tier capacity and backup/restore operations qualified with tested synthetic evidence; no hidden paid dependency; pause/zero-capacity behavior safe.
3. Hosted staging isolated, Free plan verified and approved, public enrollment off; all active migrations applied and audited.
4. Hosted Auth registration/recovery and deliverability verified with approved SMTP, appropriate VPC/consent gate still enforced.
5. Parent, child, outside family and case operator permissions pass adversarial API/SQL/Realtime checks.
6. Actual multi-session hosted message send/fetch/reconnect, revoked relationship and offline recovery proven. Client receives only authorized data.
7. Financial commands and ledger are transactional against hosted PostgreSQL; parent match secrecy, no duplicates, no unverified payout claims.
8. Journal author-only keys/device behavior and deletion/export/retention actually tested on supported physical devices.
9. Actual mobile push receipt/revocation/quiet hours demonstrated or honestly blocked.
10. Confidential report intake/response staffed and drilled or **release blocked**.
11. COPPA/state/teen law, age ranges and device-only journal rights reviewed and signed off or **release blocked**.
12. App privacy/data safety, licenses, dependency/security and independent review completed or **release blocked**.
13. Android signed artifact qualified on physical hardware; iOS native release qualification if iOS launch is claimed.
14. TalkBack/VoiceOver tests according to supported platforms, font/IME/privacy controls, screen protect, battery/memory/thermal tests.
15. CI run verified under authorized workflow and quota; rollback, DR and incident drills passed.
16. Owner receives an explicit single-page **GO / NO-GO** checklist with mandatory gates and exact evidence. **Only the owner can authorize publication/enrollment/monetary action.**

**Critical nuance:** Engineering may be "complete for external review" with some legally/physically blocked gates. That is NOT "approved for production use." Never turn external blockers into fictional passes.

## 11. Deliverables and maintenance

Create or maintain these tracked files under `spec/production/staging/`:

- `PROGRESS.md` — living checklist, branch/source, phase status, owner approvals
- `FREE_PLAN_OPERATING_BUDGET.md` — current quotas and model, nonpaying service limits, degradation thresholds
- `DEPLOYMENT_RUNBOOK.md` — guarded local/staging/production procedures, credentials/placeholders, verified project refs, rollback
- `BACKUP_RESTORE_DRILL.md` — actual backup/restore procedures, RPO/RTO, encryption/key/operator/retention
- `HOSTED_STAGING_TEST_RESULTS.md` — only true hosted proof, separated from local
- `AUTH_EMAIL_DELIVERY.md` — SMTP setup, sender controls, template/rate/deliverability tests, owner action
- `NOTIFICATIONS_DEVICE_QA.md` — provider/mobile results vs mocks
- `HARDWARE_ACCESSIBILITY_QA.md` — exact devices/tests, TalkBack/VoiceOver, local-model perf
- `CHILD_PRIVACY_OWNER_DECISIONS.md` — unresolved age/state/VPC/rights/operator decisions, source links, owners
- `OPERATIONS_AND_INCIDENTS.md` — live report staffing, access, incident drills, safe outages, contact ownership
- `RELEASE_ARTIFACT_MANIFEST.md` — SHA, signed/unsigned state, Android/iOS credentials, licenses/SBOM
- `INDEPENDENT_REVIEW_HANDOFF.md` — qualified external testing package and unresolved findings
- `FINAL_RELEASE_QUALIFICATION.md` — frozen source, actual tests, pass/fail/blocked matrix, cost, owner GO/NO-GO

Update existing `RELEASE_CHECKLIST.md`, `TEST_RESULTS.md`, `SECURITY_REVIEW.md`, `SUPPORTED_DEVICES.md`, `CHILD_PRIVACY_COMPLIANCE.md` with cross-links and new factual evidence **without erasing historical failures**. Keep short, actionable runbooks; don't create dozens of redundant policy documents if a current file already owns the topic. Write safe scripts and tests to back each operational procedure.

Implement meaningful code, migrations, tooling and native fixes, not just documents. Re-run necessary tests after each change. End-to-end release QA must include reproducible commands and actual screenshots for nonprivate views, without disabling protected-screen capture. Use exact build IDs and separate runtime/artifact commit identity.

**Final handoff:** Tell the owner exactly which operations were completed in LOCAL, which in HOSTED STAGING, which on PHYSICAL DEVICES, which are merely PREPARED, and which require approval. Provide branch, commit, paths, source/runtime/build artifact hashes, zero-cost plan and caveats, one-click/command staging procedures, test counts and failures, and a concise list of actual owner decisions with authoritative sources.

## 12. START EXECUTION

1. Confirm the local worktree and current p3 delivery state. Preserve the untracked diagnostic and existing running local services.
2. Read this entire master mission and all controlling documents.
3. Create `feature/staging-release-qualification` from latest verified p3, if safe.
4. Start concurrent bounded Free-tier operational research, security adversarial inventory, backup/restore tooling and physical-device test planning; then implement the prerequisite phases in the order above.
5. Do not spend time changing backend provider: **Supabase Free is the approved target**. Deploy synthetic staging only after explicit owner authorization; leave the project unprovisioned otherwise and continue useful local work.
6. Continue implementation, tests, corrections and documentation until every authorized, technically achievable task is complete and remaining external gates are precisely documented.
7. Commit and push development code from `D:\projects\BetweenUs`, without force or main merge. Provide a factual final qualification report.

**Do the work. Do not stop at a research document, assume the prototype is already production-approved, silently enable paid services, or bypass children's privacy and safety controls.**
