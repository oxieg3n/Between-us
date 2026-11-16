# Operations and incident qualification

Prepared 2026-11-16. **BLOCKED: OWNER / EXTERNAL.** No human safety coverage, response SLA, staffed contact, hosted incident drill or independent approval is established. Public report intake/promises and real-child enrollment stay off. Supabase Free is the selected backend; this runbook authorizes no provisioning, paid fallback or production changes. See [prior incident runbook](../runbooks/INCIDENT_AND_REPORTS.md), [privacy decisions](CHILD_PRIVACY_OWNER_DECISIONS.md), [Free operating budget](FREE_PLAN_OPERATING_BUDGET.md) and [deployment procedure](DEPLOYMENT_RUNBOOK.md).

## Accountable roles before live operation

| Role | Actual assignee / coverage | Required handoff |
| --- | --- | --- |
| Accountable legal operator / owner | UNASSIGNED for operating purposes | Entity, monitored contact, spending and publication authority |
| Child-safety lead and trained case reviewers | UNASSIGNED; no hours/holiday coverage established | Vetting, training, confidentiality, independence, severity triage, safe communications and backup coverage |
| Privacy lead / qualified counsel | UNASSIGNED | 51-jurisdiction rights, breach, reporting/preservation and custody decision matrix |
| Security responder and backup operator | UNASSIGNED | Protected privileged credentials, scoped containment/rotation, evidence access and tested recovery |
| Backup host / key custodian / restore reviewer | UNASSIGNED | Maintained host, encrypted independent copies, expiry, alarm recipient and [actual restore evidence](BACKUP_RESTORE_DRILL.md) |
| Appeals / staff-conflict reviewer | UNASSIGNED | Independent review of unsafe-guardian/staff disputes and safe status channel |

The owner must approve achievable acknowledgement, triage and follow-through targets **after** named coverage exists. Do not publish aspirational targets. No fictional fixture, assisting agent, local case assignment or queued row fills these roles.

## Case workflow and truthful status

1. Before intake, explain who can read the case, actual hours, confidentiality limits and a safe channel. Safety resources and seeking another safe adult remain available without authentication, guardian approval or report submission. This app does not provide emergency dispatch or monitoring.
2. Intake only deliberately written words and specifically selected, authorized message evidence. Never attach a journal, private draft, model prompt, entire conversation or contact book automatically. `saved` means stored; `staffedResponsePromised:false` remains literal. `triaged` or `closed` is an operator record, not proof that an underlying problem was solved.
3. Assign a specifically scoped active independent operator. The reported person, either family's guardian and unassigned staff cannot read/update the case. Recheck current scope and independence on every access, including after role/membership changes. A service key may perform reviewed assignment; it does not impersonate a case reader. Require reviewed staff MFA/session controls before public operations.
4. A trained human assesses the deliberately submitted evidence under the approved policy. Record only necessary action/reason/due metadata. Child-safe support, statutory reporting, evidence preservation and an appeal are distinct decisions; no automated custody or legal decision is authorized.
5. Choose a safe response channel with the reporter. Do not automatically notify an alleged unsafe guardian, family administrator or ordinary contact about a case, status, block or alternate safe adult. No report details, child names, message bodies, finance values or case identifiers in push/email previews. Do not assume the account's ordinary mailbox/device is safe.
6. Close only with a factual action/status and approved retention/hold decision. Preserve lawful evidence under a narrow, finite reviewed hold; do not grant ordinary family access. Withdrawal/account deletion must not reopen product authority or silently erase required case evidence. Device-only writing cannot be remotely read/erased by the server.

## Incident classification and containment

These are decision aids, not a promise of staffed response times. The assigned incident lead records start/detection time and chooses severity from actual evidence. An outage is not automatically a breach; absent telemetry does not prove confidentiality.

| Classification | Example trigger | Containment and release evidence |
| --- | --- | --- |
| Critical confidentiality/authority | Cross-family content, journal/key exposure, guardian case access, service credential compromise, child hidden-match disclosure | Quarantine affected API **and direct Data API/RPC/Realtime/worker paths**; revoke affected sessions/scopes; preserve minimal evidence. Independent regression and owner-approved recovery required. Enrollment off alone does not disable existing accounts. |
| High integrity / restored authority | Duplicate earning/send, deletion/consent revocation resurrected after restore, unauthorized invitation/token replay | Stop affected writes/workers; retain original operation IDs; quarantine restore target. Reconcile append-only money records without silently editing history. Prove tombstone/replay checks before access. |
| Safety operating failure | No independent reviewer, unsafe reply channel, overdue coverage, staff conflict | Stop public intake/promises; route internally only through named approved humans. Keep public safety resources reachable. Do not disclose an allegation to the reported guardian. |
| Availability / quota / pause | Supabase pause, database/egress exhaustion, SMTP/push failure, failed backup schedule | Honest unavailable/read-only state; no confirmed send/earning/payout without server result. Preserve immutable uncertain commands for explicit resolution. No automatic paid upgrade or synthetic keepalive. |
| Local device / key failure | Missing/wrong key, compromised/shared OS account, lost device, biometric invalidation | Lock and explain recovery limits; never regenerate over ciphertext or issue a guardian journal key. Remote revocation cannot instantly reach an offline device; qualify bounded lease/idle behavior on hardware. |

Containment must preserve public/offline safety information and already-authorized local journal behavior within its existing bounded lease; it must not expand cloud permission during an outage. Do not bypass RLS, Auth hooks, independent verification or blocks to restore service. A saved sender receipt is not recipient delivery, reading or permission to resend.

## Operational sequence

**Detect and record:** record a random incident reference, environment, exact artifact/config version, UTC timeline, affected category, aggregate counts and responsible human. Use the [manifest](RELEASE_ARTIFACT_MANIFEST.md). Keep credentials, Auth tokens, child identities, message/report bodies, journal content and raw database dumps out of chat, tickets, telemetry and CI artifacts.

**Restrict:** use protected owner-controlled channels to stop affected admission/delivery and revoke current authority. Review both Edge and direct RPC exposure. For staff compromise, remove scope/assignment and revoke sessions before reassigning. For credential exposure, owner rotates/replaces the credential through the approved secret store, updates the correct environment, invalidates affected sessions as appropriate and proves the old credential is denied. No secrets are printed or committed.

**Assess:** qualified privacy/child-safety/security reviewers determine actual affected records, safe contacts, jurisdiction-specific notice/reporting duties and deadlines, provider involvement and narrowly justified preservation. There is no universal invented breach deadline or automatic notice to all guardians. Preserve integrity without copying local journals or entire case queues for diagnosis.

**Recover:** use [backup/restore proof](BACKUP_RESTORE_DRILL.md) and the [deployment runbook](DEPLOYMENT_RUNBOOK.md). Verify exact schema/version, current revocation/deletion chronology and old-credential denial while the target remains inaccessible. Reconcile uncertain sends and financial UUID/fingerprints without inventing replacement IDs. Confirm safe quotas, provider delivery and case independence before resuming affected features. Rollback is not permission to discard transactions or replay an old consent grant.

**Communicate and close:** only actual authorized humans send approved safe notices. No messages or notices were sent by this engineering work. Record factual scope/actions, reviewer sign-off, unresolved risk, restoration checks, notifications actually completed and a follow-up owner/date. Repeat drills after material policy, supplier, schema or staff changes.

## Required tabletop and technical exercises

| Exercise | Required observable outcome | Current evidence |
| --- | --- | --- |
| Child reports guardian; operator later becomes either party's guardian | Previously assigned old bearer cannot read/update; reporter keeps permitted own status; no allegation notification | New `qualification-security.test.ts` / `qualification_security.test.sql` prepared; Root executes and records actual outcome |
| Staff scope/session revoked or conflicting assignment | Old credentials denied at SQL/RPC and safe reassignment reviewed | Existing local scope tests plus new current-state cases; no staffed drill |
| Supabase pause / zero capacity / SMTP outage | Honest degradation, static safety access, original uncertain command preserved, money changes blocked | Engineering tests/runbooks only until Root records the exact run; hosted untested |
| Corrupt/partial archive, missing key, stale tombstones | Restore refuses or stays quarantined; deleted/withdrawn authority never served | Recovery tooling/drill owns factual evidence; operational host/offsite custody unassigned |
| Key compromise | Old privilege denied before recovery; protected replacement environment validated | PREPARED; no real rotation performed |
| Unsafe guardian/shared device/safe response channel | No automatic guardian notification; safe human procedure and physical privacy controls demonstrated | BLOCKED: OPERATOR / HARDWARE |
| Missed schedule, low disk, credential expiry, unavailable custodian | Alert reaches named backup person; measured recovery and independent copy proven | BLOCKED: OWNER / EXTERNAL |
| Statutory disclosure/deletion/hold dispute | Counsel applies current jurisdiction/category duty and safe notice; no journal backdoor | BLOCKED: COUNSEL / OPERATOR |

The existing [local start/check commands](../runbooks/LOCAL_AND_CI.md) remain canonical. Only Root serializes DB/service/native operations. Prepared offline commands `node scripts/staging-preflight.mjs --local` and `node scripts/staging-plan.mjs --dry-run` must be run from `D:\projects\BetweenUs\services\backend` only after their own implementation/validation receipt; a dry run is not a deployment or operational pass.
