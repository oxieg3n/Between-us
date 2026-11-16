# Release checklist — not a release approval

Updated 2026-11-16. Candidate `1116-ProductionFoundation-p3`, mobile `0.4.1`, backend `0.1.0`, `feature/production-foundation`. Backend additions: `467c530`; authenticated mobile integration: `07e333e`; final keyboard source: **`0c2d325`**. Final documentation commit/push and delivery receipt remain pending. Engineering, legal and operating qualifications are not complete. No public/production deployment, real-child enrollment, paid resource, store submission or main merge is authorized.

## Latest checkpoint and still-pending local gates

Root reported **926 SQL assertions / 19 files PASS through applied 024**, **55 backend units + typecheck/build PASS**, **11 integration scenarios PASS**, and **260 mobile units + typecheck/lint PASS after all fixes**. Expo Doctor **20/20**, installed SDK check and both npm audits **0 vulnerabilities** passed. Final post-keyboard production browser passed **16/16 in 1.7 minutes**; demo passed **19/19 in 2.1 minutes**. Android/iOS Hermes and six-route static web exports passed with exit 0; this is not a native iOS build. Concurrent-bundler 14/16 and 8/19 startup-failure runs remain in ignored logs; no test logic weakened. Counts overlap earlier snapshots and are not added.

Scoped native passes: guarded cold start; outbox exact response-loss force-stop/cold-restart recovery with one client UUID/message; separate-directory journal enrollment/autosave/save/local reflection/background lock with **synthetic emulator fingerprint only**; actual 1.0→2.0 heading growth from 92 to 112 px with words preserved; and focused 1.3 composer focus/continued typing, followed by restored 1.0. Latest visual inventory is **30 themed originals, 15/theme**, six resize originals, six comparison pairs and two contact sheets. Protected Journal/chat/Review were not captured and capture protection remains enabled.

Native follow-up passed an **84-second 503 outage** with an already unlocked Journal editing/confirmed local Save, normal two-minute idle lock, restored route and fresh online/device proof for selected in-memory review, and typed DELETE/fresh-biometric own erase with native journal file count 0. Synthetic emulator-only PIN was cleared. Three density profiles were viewed readable after the host-key fix; original configuration restored. **Absolute lease expiry was not tested natively**. Final documentation/delivery and artifact-source mapping remain root receipts. Physical/iOS/restore/signing/device-push/hosted/legal/operator gates stay open; [ledger](TEST_RESULTS.md), [device limits](SUPPORTED_DEVICES.md).

The real small-screen IME defect is preserved in the ledger: Android chat supplied no keyboard-avoidance behavior, leaving Review below the IME. Shared measured-top padding and the compact chat header in `0c2d325` passed the final 720×1280/density 320 case: full textbox 104 px / 52 dp, Review 98 px, actual Review tap reached **Send reviewed message; no send**. [Keyboard evidence](../qa/production/p3/device-sizes/keyboard-results.json). Original 1080×2424/density 420/font 1.0 restored. Native iOS keyboard remains untested.

## Historical P2 handoff snapshot

This is a handoff snapshot. Root-owned `TEST_RESULTS.md` / final build reporting must identify the exact final commit, commands and later outcomes; do not relabel the evidence below as a final integrated run.

| Evidence actually reported at this handoff | Scope / limit |
| --- | --- |
| SQL migrations 001–022 applied on localhost; latest full 831 pgTAP assertions across 17 files passed | Local authorization/domain regression evidence using fictional fixtures. Synthetic-claim SQL coverage is distinct from managed Auth HTTP tests. No hosted schema/project qualification. Earlier failed migrations/tests remain failures at their original snapshots. |
| Backend prior combined run: 47 unit tests, typecheck and build passed | Local source/component evidence; final candidate changes still need root's exact rerun record. |
| Mobile prior combined run: 220 unit tests, full typecheck and lint passed | Before the latest small custom Conversation safety-link UI change. Do not claim final-source checks until the post-change rerun is recorded. |
| Nine real local managed Auth/HTTP scenarios and one actual WebSocket scenario passed previously | Real local Auth/session and server adapter/RPC flows; immutable-JWT stale-session Realtime proof with an authorized positive control. No hosted SMTP, real VPC, capacity guarantee, public recovery service or push/device delivery. |
| Production browser first run: 14/15 passed | Missing Help & safety link in the custom Conversation list corrected; full 15-case rerun ongoing. This row is not a 15/15 pass. |
| Android p2 debug native transport/build: passed in 29 seconds and installed | Local debug artifact at its recorded snapshot, not release signing or physical/iOS qualification. Further native recovery checks are ongoing. |
| Native parent explicit Review send observed saved by server; separate SQLCipher outbox database observed | Root observed distinct `no_backup/between-us-message-outbox`; journal directory remained empty. No recipient-device delivery or read claim. Process-death pending recovery, first journal enrollment after outbox use and outbox wrong-key probe are not yet verified. |
| Latest rerun of r12 demo: 19 Playwright scenarios passed in 2.1 minutes | Existing fictional prototype. Not the production account UI or latest check-in screen. |

Use `[x]` only with dated reviewer/evidence attached. An implemented configuration field, draft policy, operator fixture or test fake is not an approved production capability.

## Candidate source and local checks

- [ ] Owner/release lead identifies exact feature-branch commit, clean expected source state, activated migration list/hash, dependency lockfiles and bundle/native artifact hashes. All Git integration stays at `D:\projects\BetweenUs`; no force push/main merge/publication without approval.
- [ ] Complete mobile typecheck/lint/unit tests, production UI interactions and account-bound stale-operation cases pass on the final source. Historical r12 results remain separately labeled.
- [ ] Complete backend typecheck/unit/build, every active pgTAP file, real managed Auth/password/TOTP/recovery/consent/contact/message/privacy/check-in scenarios and concurrent authorization/race tests pass locally.
- [ ] Validate upgrade from prior schema as well as fresh installation; verify migration 005 security fix and all subsequent overrides are applied. No `.pending` migration is silently treated as active.
- [x] Root's 2026-11-16 local gate: mobile 260/type/lint, backend 55/type/build, SQL 926/19 files, 11 integration, final post-keyboard production browser 16/16, demo 19/19 and Android/iOS/web JS exports passed. [Evidence](TEST_RESULTS.md). This does not replace final documentation/delivery, signed artifact or external qualification.
- [x] Root's 2026-11-16 scoped native outage/local Save, normal idle lock, fresh in-memory selected review and typed own-vault erase passed. [Evidence](TEST_RESULTS.md). No offline unlock/cloud finance/chat authority; native absolute lease expiry still untested.
- [ ] Separately exercise native absolute lease expiry and remaining lifecycle/fault timings; pure lease/SQL coverage and two-minute idle are distinct evidence.
- [ ] Regress corrected scope pagination/navigation intent, stale send completion, restored-draft content CAS, initial Auth cover, per-thread uncertain navigation and background/idle clear versus attempted-command preservation on the integrated UI. See [security findings ledger](SECURITY_REVIEW.md).
- [ ] Inventory every SDK, native artifact, model/license/hash and backend tool; review ignored lifecycle scripts before selectively permitting any. No unverified model picker, prompts/sessions in files or cloud AI.
- [ ] Owner installs the inactive CI template using authorized workflow permission; manual CI source reviewed and one approved free-quota run validated. Workflow remains manual only, contents-read, no caches/artifacts/secrets/deployment; its existence is not a CI pass.

## Privacy, authority and safety gates

- [ ] Owner and qualified reviewers set the youngest appropriate age and maximum age/transition policy, with readability/usability/accessibility and credential evidence. Guardian-managed setup with every child/teen remains mandatory at every age; own credentials/acceptance and legally required teen consent remain distinct.
- [ ] Review all candidate US states toward maximum lawful coverage; approved allowlist is evidence-backed, unreviewed locations denied, coarse guardian-declared state only. No nationwide certification or 13+ workaround.
- [ ] Select/approve direct notice, VPC, guardian relationship evidence, independent verification method/expiry, unsafe-guardian support, disputes/appeals and safe recovery. Email control, checkbox and parent contact approval are not substitutes.
- [ ] Counsel resolves under-13 parental rights versus author-only device journal keys, deletion/export and permanent-loss explanations. No backend journal or guardian recovery bypass is added to evade the conflict.
- [ ] Approve an exhaustive data inventory, finite retention, legal holds and actual full deletion/export plan across new domains, vendors/backups/derived copies. `requested`, `ready`, `provider_accepted` and `access_revoked` retain their precise meanings; full deletion is not established while blockers remain.
- [ ] Name and train confidential report operators; approve scope, coverage/hours, triage/response targets, mandatory-reporting/escalation, evidence handling, case access and appeals. Demonstrate unsafe-guardian and staff-compromise drills. Synthetic staff fixtures do not staff a service.
- [ ] Independently review authentication, active sessions, object authorization, private case NULL branches, cross-family/external relationships, both block directions, stale/offline/queued behavior, neutral notifications and hidden matching equivalence.

## Hosting, operations and cost gates — unrun

- [ ] Explicit owner approval for a separate synthetic staging project and any credentials/resources. Record project/region/operator, protected secrets, redirect/origin allowlists, data-processing terms and provider spending ceilings first. No hosted project is configured by this checklist.
- [ ] Separate local/staging/production; demonstrate default-closed policy records, no synthetic bypass in a release, strong operator access and service-key isolation. Test exact app-link/deep-link allowlists against the final app scheme; current source/config values need reconciliation and final runtime proof.
- [ ] Approve SMTP/domain ownership and deliverability/recovery procedure. Local mail capture is not real email delivery.
- [ ] Qualify actual FCM/APNs credentials, platform/device tokens, opt-in/quiet hours, provider response, retry/revocation and physical-device receipt. Background check-ins remain app-open only until a worker and transport are operated/tested.
- [ ] Complete recoverable backups, restore isolation, deletion/revocation tombstone replay, provider expiry evidence, disaster recovery RPO/RTO and incident tabletop. No restore drill is established.
- [ ] Owner approves budget/quotas, alert recipients and hard stop/degrade paths without automatic paid upgrades. Verify actual account limits and CI free usage; alert emails alone do not cap spend.

## Native, signing and store gates — incomplete

- [ ] Pass [supported-device qualification](SUPPORTED_DEVICES.md): physical Android ARM64 and iPhone/iPad as applicable, minimum/current OS, biometrics/shared devices/background/backup/export/delete, model hardware, spoken accessibility, keyboard and large text.
- [ ] Verify final native minimum/target SDK, ABI/OS support and permissions from generated/signed artifacts. No minimum OS or device support promise comes from an x86_64 debug build.
- [x] Root's 2026-11-16 scoped native response-loss/kill/restart case retained the original approved UUID and produced exactly one saved message, followed by explicit recovery/cleanup. [Evidence](TEST_RESULTS.md). This is one emulator scenario, not all recovery/device/network cases.
- [x] Root's 2026-11-16 separate-directory outbox followed by journal enrollment/autosave/save/local reflection/background lock passed with **synthetic emulator fingerprint only**. [Evidence](TEST_RESULTS.md). No physical biometry or restore approval.
- [x] Root's 2026-11-16 native hot-font case showed heading 92→112 px at 1.0→2.0 with words retained, and focused 1.3 composer retained focus/accepted appended text; original 1.0 restored. [Evidence](TEST_RESULTS.md). Wider IME/device/accessibility qualification remains open.
- [ ] Extend interruption/device coverage to revoked/blocked relationships, account changes, wrong/missing keys, key/device loss and retained saved-terminal cleanup. Browser recovery remains explicitly memory-only. Missing native APIs/legacy outbox files fail closed; do not migrate/delete/reset them silently.
- [ ] Verify author-local journal/protected drafts and separately keyed nonbiometric outbox storage on physical devices, with no backup/transfer/public-files fallback and no key regeneration over ciphertext. Test shared OS accounts, device-only SecureStore loss, biometric changes, restore and retention/recovery explanations.
- [ ] Preserve Android `FLAG_SECURE` for journal, conversation and Review during all QA and store-asset preparation. Protected/blank screenshots are expected; do not disable capture controls to collect private-screen evidence. Use permitted nonprivate fixture screens or approved illustrations.
- [ ] Owner supplies/controls release keystore/certificates/profiles and recovery custody; inspect signing config, debug-key exclusions, release symbol/log handling and signed AAB/IPA. No signing key belongs in Expo public config, repository or logs.
- [ ] Approve truthful store metadata, actual App Privacy/Data safety inventory, categories/target ages, children/social safeguards, account deletion website, privacy/support URLs, screenshots, accessibility declarations and encryption/export-compliance answers. [Store drafts](store/README.md) remain unpublished.
- [ ] Owner signs final go/no-go record with exact reviewed build and verified rollback/operations ownership. A failed or missing material gate means enrollment/publication stays OFF.

Runbooks: [local/CI](runbooks/LOCAL_AND_CI.md), [deployment/rollback](runbooks/DEPLOYMENT_AND_ROLLBACK.md), [recovery/backups/deletion](runbooks/RECOVERY_AND_BACKUPS.md), [incidents/report handoff](runbooks/INCIDENT_AND_REPORTS.md), [cost controls](runbooks/COST_CONTROLS.md). These are reviewable procedures; unperformed steps remain unverified.
