# Staging release qualification progress

2026-11-16. Owner mission `MASTER_STAGING_RELEASE_QUALIFICATION.md`, remote `f859bfb`, baseline `53f7ebe`. Workspace `D:\projects\BetweenUs`, new branch `feature/staging-release-qualification`. Supabase Free is the selected intended provider. This is engineering qualification with fictional local data; hosted provisioning, credentials, public enrollment, signing, paid resources and real-child data are not authorized.

## Phase ledger

| Phase | Current status / evidence |
| --- | --- |
| A — baseline/contracts/risk | PASS baseline reproduced, then025/026 applied without reset. New final checks: mobile276/type/lint, backend89/type/build, SQL1,025/21files, real local Auth/SQL/Realtime integration17. Final isolated production browser16/1.8min and demo19/1.9min PASS. Shared-fixture15/16 failure preserved; fixture isolation corrected QA without changing financial guards. Temporal failures reproduced before025, corrected and retained; test fixture/automation failures are not hidden. |
| B — Free-tier operations/config | IMPLEMENTED LOCAL: strict paired mobile target admission (hosted allowlist empty, production disabled), offline fingerprint/preflight/plan, capacity model/dashboard, service-only aggregate sample recording and direct-RPC database circuit. Missing/stale provider metrics fail closed outside the trusted local fixture mode. Sampled limits are not a billing guarantee. INTERNAL RELEASE GATE: financial longevity/checkpoint design; measured prospective cap increase failed CPU headroom. |
| C/D — hosted project/service qualification | BLOCKED: OWNER. No named approved Free project, provisioning authorization, protected credentials, SMTP/domain or delivery approval. Prepare local equivalents and exact owner steps. |
| E — encrypted backup/isolated restore/replay | PASS LOCAL026 rehearsal:74tables,200restored SQL assertions, exact idempotency and two tombstone replays,7.438s restore/8.237s snapshot age. Fresh001–026 install passes1,025 assertions, schema/owner/RLS/grant parity and closed defaults. Actual financial SQL transaction termination proves rollback of2events/2commands;31 held-transaction checks separate from1,025. All targets remain quarantined. Hosted/offsite/operator DR remains BLOCKED. |
| F — hardware/mobile/push | Emulator debug build/upgrade, distinct accounts, both themes, keyboard, hot200% draft preservation, four viewport sizes, protected conversation FLAG_SECURE and offline public help verified. TalkBack PARTIAL; physical ARM64, macOS/iOS, actual push and owner signing BLOCKED. Screenshots/manifest record actual artifact scope, not physical or release claims. |
| G — child privacy/operations | PREPARED handoff/51jurisdiction discovery register; all unreviewed scope DENY. Guardian-managed setup at every child/teen age. Counsel, approved VPC/journal-rights disposition and named trained operator remain unassigned. No staffed promises. |
| H — CI/release/independent review | PREPARING. CI stays an inactive template; workflow installation/dispatch and runner quota require authorization. No release key or independent certification. |
| I — final frozen acceptance | NO-GO for enrollment/public release. Candidate source/artifact hashes, actual local checks and mandatory internal/external gates are in FINAL_RELEASE_QUALIFICATION.md. Commit/push evidence is recorded after integration. |

Baseline logs remain in ignored `.local/staging-baseline-*` and `.expo/staging-baseline-*` files. Counts are new measured runs, not sums of historical results. Local synthetic tests are not hosted staging evidence.

## Ownership

- Root: integration/API/SQL migrations/package/config/Git, active Docker/DB, emulator/ADB/native builds, progress/final evidence.
- `free_plan_ops`: pure Free-plan model/aggregate dashboard, offline preflight/plan and assigned operating-budget/deployment/email documentation.
- `recovery_tooling`: guarded backup/recovery modules and tests, actual rehearsal prepared for Root execution, backup report.
- `security_qualification`: adversarial SQL/managed-session tests, 51-jurisdiction discovery register, operator and independent-review handoff. No independent legal/security certification.

No helper may mutate the shared database, run Docker/ADB or perform Git integration. Package changes and resource-intensive tests remain serialized.

## Initial risks and controls

| Finding | Status / action |
| --- | --- |
| Q001: actor()/finance authority use transaction-start expiry time | RESOLVED in025; live-clock session/JWT/consent checks and post-session/family-lock checks pass targeted and full suites. In-flight operation semantics remain narrowly documented; HTTP exploitability is not overstated. |
| Q002: Free backup download consumes uncached egress | Include backup exports in capacity forecast. Weekly exports are assumptions, not an approved RPO or operated schedule. No destructive quota response or paid fallback. |
| Q003: existing financial event safety cap | 128 visible/32 hidden events per child currently bound service state; annual growth forecasts must expose this application limit, not imply sustainable unlimited ledger operation. No automatic audit deletion or blind cap increase. |
| Q004: restore can resurrect revoked authority | LOCAL proof PASS: authenticated ciphertext plus trusted registry digest, exact snapshot verification and two separately authenticated tombstone replays; old managed tokens denied at source and restored SQL claims denied after replay. Targets remain connection-quarantined; hosted Auth/provider/offsite recovery not qualified. |
| Q005: hosted, physical, legal and operated services absent | Keep gates explicitly BLOCKED; prepare tested local artifacts and owner actions. No fake SMTP, push receipt, staffed reports, VPC or iOS result. |
| Q006: capture permission/CNG compatibility | RESOLVED config/source/runtime: unused photo access blocked; normal DETECT retained for pinned SDK eager callback. Reviewed CNG plugin repairs stale remove marker;3tests and actual native protected-window checks pass. No protection disabled. |
| Q007: native large-text navigation/readiness | RESOLVED observed200% Journal word wrap via internal padding, preserving scaling/hit target. Light status icons corrected. Own launcher now waits bounded20s for a busy Metro, still rejecting unowned listeners and never replacing them. |

The original diagnostic remains untracked and unchanged (SHA256 `34acb427bf1f0a4a1749104a4066bb389a54680641c2f9437fdfdc4186f8c56c`). Deprecated workspace absent; origin/history/worktrees preserved. Public `docs/` and root `index.html` are out of scope.
