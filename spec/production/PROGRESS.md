# Production completion progress

Git delivery verified on2026-11-16: source/evidence commit **920cf3cceb7e3fbe460e01f64e550da1e6c079bb** is on origin/feature/production-foundation with an exact matching remote ref. Working tree is clean except the intentionally preserved diagnostic. This follow-up supersedes earlier pending-push notes below; application source remains0c2d325. CI is an inactive owner-installable template because the current credential lacks workflow permission. See [delivery receipt](DELIVERY_RECEIPT.md). No main merge, workflow run or production deployment.


## Latest P3 verification checkpoint — 2026-11-16

`1116-ProductionFoundation-p3`, app `0.4.1`, `feature/production-foundation`. Backend additions: `467c530`; authenticated mobile integration: `07e333e`; final keyboard source: **`0c2d325`**. Root's final documentation receipt/push remains pending. Earlier checkpoints below retain their own results and outstanding work.

- Local migrations **001–024 applied; 926 SQL assertions / 19 files PASS**. Backend **55 units + typecheck/build PASS** and **11 integration scenarios PASS**. Mobile **260 units + typecheck/lint PASS after all fixes**, including keyboard integration; prior 256/259 counts remain historical. Expo Doctor **20/20**, installed SDK check and both audits **zero vulnerabilities** passed.
- Actual native passes now include guarded package cold start after ready Metro, separate-directory outbox use followed by journal enrollment/autosave/save/local reflection/background lock with a **synthetic emulator fingerprint**, and exact-response-loss force-stop/cold-restart recovery with **one client UUID / one message**. Ciphertext checks remain scoped file observations, not forensic or physical-device certification.
- Actual hot font changes now pass: 1.0→2.0 grew the observed heading from **92 to 112 px** with words retained; a focused 1.3 composer retained focus and accepted appended text. Original 1.0 was restored. Earlier recreation/draft-loss and stale-text failures stay recorded below and in [device history](SUPPORTED_DEVICES.md).
- Latest visual inventory is **30 themed originals, 15/theme**, plus **six resize originals**, six light/dark comparison pairs and two contact sheets. [Visual report](../qa/production/p3/VISUAL_QA_REPORT.md). Protected Journal/chat/Review were not captured. Files/composites are not test-case counts; earlier 26-image checkpoint remains historical.
- Final post-keyboard production browser passed **16/16 in 1.7 minutes**; demo passed **19/19 in 2.1 minutes**. Android/iOS Hermes bundles and static web export (six routes) **PASS, exit 0**. JS exports do not establish a native iOS build or signed embedded release. Earlier concurrent 14/16 and 8/19 startup failures remain in ignored logs; test logic unchanged.
- Native bounded-outage follow-up **PASS**: an already unlocked Journal continued editing and confirmed local Save during an 84-second 503 outage; normal two-minute idle locked it. After route restoration, fresh online verification/device biometry revealed selected saved offline writing in memory. Typed DELETE plus fresh biometry confirmed own-vault removal in UI and native journal file count 0. Synthetic emulator-only PIN was cleared afterward. **Absolute lease-expiry timing was not tested natively**; pure lease/SQL tests pass.
- Native size QA initially reproduced small-profile Help/navigation clipping and tablet navigation clipping. After the density-aware host-key change, root viewed readable Home/full navigation on all three profiles of the **same Pixel_10 emulator**: 720×1280/density 320, 1440×3120/density 480, and 1600×2560/density 240. Original 1080×2424/density 420/font 1.0 was restored. [Originals and retest results](../qa/production/p3/device-sizes/) remain evidence, not physical-device qualification.
- A separate real small-screen IME defect put Review below the keyboard. Final shared measured-top/padding frame and compact chat header passed on 720×1280/density 320: keyboard shown, full textbox 104 px (52 dp), Review 98 px, and an actual tap reached Send reviewed message. **No Send was pressed.** [Keyboard results](../qa/production/p3/device-sizes/keyboard-results.json), [native report](../qa/production/p3/NATIVE_QA_REPORT.md). Original 1080×2424/density 420/font 1.0 restored; native iOS keyboard remains untested.

Release engineering remains **incomplete**: root's final documentation/push receipt and external qualification remain pending. The classic debug APK is **125217918 bytes**, SHA-256 `5FBBC33431E84B401B0FBEA137E646A3D3D6BF1EAB8767C180E1F811F4DFE594`; Metro JS must separately match source `0c2d325`. It is not a signed embedded release. Physical Android/biometry/restore, native iOS, signing, hosted operation, device push, legal/privacy decisions and operators remain gates. Fictional local services do not open public enrollment, real-child information or actual transfers. See [ledger](TEST_RESULTS.md), [handoff](FINAL_BUILD_REPORT.md), [checklist](RELEASE_CHECKLIST.md) and [launch](ANDROID_LAUNCH.md).

## Earlier P3 continuation snapshot — 2026-11-16

Current candidate: `1116-ProductionFoundation-p3`, app `0.4.1`, Android version code `3`, iOS build number `3`. Work remains on `feature/production-foundation` at `D:\projects\BetweenUs`; root reported base HEAD `338630a` with uncommitted UI work. This is not a final source commit or a clean-tree receipt. The original r12 baseline and historical checkpoints below remain preserved.

Release engineering is **incomplete**. Public enrollment, actual child data, real financial transfers, paid resources and production publication remain disabled/unapproved. No main merge or public deliverable change is reported by this continuation.

| Workstream | Current local result / remaining work |
| --- | --- |
| Managed identity and authority | Real local Auth, guardian-managed onboarding at every child/teen age, distinct child credentials, current-session/consent checks, account/privacy portal and revocation implemented. Prior 9 managed Auth/HTTP scenarios pass; real verification/operator/age/state policy is still a release gate. |
| Server persistence and privacy | Migrations 001–022 applied localhost; 831 pgTAP assertions across 17 files pass. Messages, accepted/verified contacts, bilateral blocks, confidential cases, finance, check-ins, own-data projections and staged deletion are implemented within their documented limits. Full legal deletion is not established by access revocation or a request record. |
| Message interruption recovery | Actual native response-drop test passed: server saved, UI stayed unknown, Home/Journal navigation remained available, app force-stopped/cold-restarted, explicit Find → Review → Retry completed cleanup. PostgreSQL showed exactly one message and one client UUID. No automatic retry or recipient-device/read claim. |
| Native private storage | Distinct SQLCipher outbox sibling observed; encrypted file header is not SQLite and fixture plaintext was not observed. Journal directory remained empty after send. Synthetic emulator biometric journal QA is in progress; physical biometry, restore/iOS and forensic assurance remain unverified. |
| Integrated UI/regression | Production browser 15/15 pass in 1.3 minutes after Help-link/Auth-gate fast-switch fixes; original r12 demo 19/19 pass in 2.1 minutes. Mobile 223 units/type/lint passed before the newly added five font-plugin tests; new full count is pending. |
| Native build/display | P3 debug transport build passed in 26 seconds; subsequent font-scale plugin build passed in 16 seconds and installed. Earlier hot font change lost the draft and returned Home; corrected installed build's actual retest is in progress. Build success does not close that defect's runtime gate. |
| Finance notification producer | Proposed 023 is under review and **not applied**. Its behavior is not included in the 001–022/831 passing result. |
| Release package | Draft CI, store/policy and operations documents exist; hosted operation, signing, physical/iOS/accessibility, legal and operator decisions remain open. |

Root is completing the font-change/journal emulator checks and final p3 photos/report, then will record final source/artifact identity, full test count and delivery status. [Verification ledger](TEST_RESULTS.md), [build report](FINAL_BUILD_REPORT.md), [Android launch](ANDROID_LAUNCH.md) and [release gates](RELEASE_CHECKLIST.md) provide the handoff. Do not add overlapping test counts or treat earlier build evidence as the final p3 artifact.

## Historical P1 checkpoint

Baseline `c301148536db955525d429600323bfbf39f751e3` / `1115-FamilyEnvelopes-Journal-r12` preserved. Work at `D:\projects\BetweenUs` on `feature/production-foundation`. Original untracked diagnostic is preserved and excluded from commits.

- [x] Verify baseline, branch, working tree, remote, root/mobile instructions, current source/tests and prior reports.
- [x] Compare current Cloudflare/Supabase/Firebase limits, billing and security implications; select coherent local Supabase architecture.
- [x] Document architecture/trust boundaries and initial threat model before persistent service work.
- [x] Research child privacy/platform obligations and separate author-local journal storage contract; no legal approval implied.
- [x] Implement/test real local Auth, session revocation, family/consent/relationship authorization; guardian-managed setup at every child/teen age. Hosted staging and reviewed verification remain gates.
- [ ] Implement/test message delivery, blocking, confidential report/notification outboxes and retention/export/deletion.
- [x] Reuse finance domain in authoritative transactional API; deterministic/CAS/replay/surprise-visibility unit and SQL tests pass. Managed-HTTP concurrent transaction tests and production capacity review remain.
- [ ] Integrate production onboarding/settings/four-tab UI, protected session and author-local vault; isolate r12 demo.
- [ ] Harden local AI/lifecycle/native permissions, build release artifacts, run full regression/native checks.
- [ ] Prepare CI/deployment/backup/incident/store package and exact owner actions; commit/push verified work.

Specialist ownership: costs/comparison helper owns COST_ANALYSIS.md/BACKEND_COMPARISON.md; privacy helper owns CHILD_PRIVACY_COMPLIANCE.md/policy drafts; journal helper initially owns JOURNAL_STORAGE.md. Master owns architecture, dependencies, integration, Git and serialized service/native operations. Implementation contracts are assigned separately before source edits.

Public enrollment and real child data stay disabled. Legal launch states/age eligibility/VPC/journal-rights policy, safety operator, hosted credentials/SMTP/push and store/signing approvals are external gates, not permission to stop independent local implementation.

Checkpoint: 413 pgTAP assertions, two real managed-Auth HTTP scenarios, and all 19 original demo browser scenarios pass. Android x86_64 debug compilation succeeds; native runtime and production-screen browser QA are next. See [actual checks](TEST_RESULTS.md). New contact/check-in/vault/model screens are being integrated; their existence is not an operational-service or production-readiness claim.
