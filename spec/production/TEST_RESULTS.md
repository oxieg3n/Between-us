# Production verification log

Git delivery verified on2026-11-16: source/evidence commit **920cf3cceb7e3fbe460e01f64e550da1e6c079bb** is on origin/feature/production-foundation with an exact matching remote ref. Working tree is clean except the intentionally preserved diagnostic. This follow-up supersedes earlier pending-push notes below; application source remains0c2d325. CI is an inactive owner-installable template because the current credential lacks workflow permission. See [delivery receipt](DELIVERY_RECEIPT.md). No main merge, workflow run or production deployment.


## Latest P3 verification — 2026-11-16

Build `1116-ProductionFoundation-p3`, app `0.4.1`, `feature/production-foundation`. Root reports backend `467c530`, mobile integration `07e333e`, final keyboard source **`0c2d325`**. Final documentation receipt/push pending. Earlier checkpoints remain historical; fictional local results are not signed/public-release approval.

| Check | Latest reported result / exact limit |
| --- | --- |
| Local SQL through 024 | **926 assertions / 19 files PASS**; 001–024 applied localhost. This supersedes the earlier unapplied-023 checkpoint without rewriting it. |
| Backend | **55 units + typecheck/build PASS**, latest reported rerun. No hosted-service or release-artifact receipt is inferred. |
| Backend real integration | **11 PASS**, separate from unit doubles and synthetic-claim SQL. Prior HTTP/WebSocket results below are overlapping component history, not extra tests to add. |
| Mobile | **260 units + typecheck/lint PASS after all fixes**, including final shared keyboard integration. Prior 256/259 snapshots and four focused host tests are not added again. |
| Mobile tool/dependency checks | **Expo Doctor 20/20, installed SDK compatibility check PASS**; mobile/backend npm audits **0 vulnerabilities**. Audit results are not a security certification. |
| Production browser | **Final post-keyboard 16/16 PASS, 1.7 minutes**, source `0c2d325`. Prior serial 16/16 in 3.8 minutes and concurrent 14/16 startup-failure logs preserved; no test logic weakened. Older 15/15 and 14/15 snapshots remain below. |
| Isolated r12 demo | **19/19 PASS, 2.1 minutes**, serial with cache clearing. Earlier concurrent-bundler attempt ended 8/19 with startup failures; ignored logs preserved. |
| Native guarded cold start | **PASS** after ready Metro; own-package cold restart resolved observed black/red startup. No reinstall, data wipe or broad process kill is implied. |
| Native journal after outbox use | **PASS** for enrollment, autosave, explicit save, local reflection and background lock, with **synthetic emulator fingerprint only**. Distinct outbox/journal directories were exercised. Not physical biometry, multi-author hardware/key isolation, iOS or restore. |
| Native exact approved-send recovery | **PASS**: successful server response deliberately lost, unknown UI, Home/Journal navigation, force-stop/cold restart, explicit original-command retry/cleanup, exactly **one client UUID and one message**. No automatic resend/device-delivery/read claim. |
| Outbox file probe | Non-SQLite header and no fixture plaintext observed in probed ciphertext; scoped observation, not complete file/sidecar/backup/forensic assurance. |
| Native hot font | **PASS**: 1.0→2.0 heading **92→112 px**, same words; focused 1.3 composer kept focus and accepted appended text. Original 1.0 restored. Does not qualify every field, IME, screen reader or physical device. |
| Native p3 images | **30 themed originals, 15/theme; six resize originals; six comparison pairs + two contact sheets**. [Visual report](../qa/production/p3/VISUAL_QA_REPORT.md), [native report](../qa/production/p3/NATIVE_QA_REPORT.md). Protected Journal/chat/Review not captured; files/composites are not test counts. |
| Native bounded Journal outage | **PASS**: already unlocked Journal continued edits/confirmed local Save during 84 seconds of 503; normal two-minute idle lock observed. No offline unlock/cloud authority implied. |
| Native own readable review/erase | After normal route restoration and fresh online/device proof, selected review included saved offline writing in memory. Typed DELETE/fresh biometry confirmed own-vault deletion and native journal file count 0. **PASS for this emulator scenario**. |
| Absolute Journal lease expiry | **NOT tested natively**. Pure lease and SQL tests pass; the normal two-minute idle-lock observation is not the absolute-deadline test. |
| Native size QA | Initial small Help/nav and tablet nav clipping retained; density-key retest viewed readable Home/full nav on all three Pixel_10 profiles listed below. **Scoped PASS**, not physical qualification. Final documentation/delivery receipt remains root work. |
| Native small-screen keyboard | **Scoped PASS after proven failure**: 720×1280/density 320, IME shown, full textbox 104 px / 52 dp, Review 98 px; actual tap reached Send reviewed message. **No send**. Native iOS keyboard untested. |
| JS/assets exports | `--platform all`: Android/iOS Hermes bundles plus static web export (six routes) **PASS, exit 0**. JS export is not a native iOS build or interaction pass. |
| Current local API health | Build p3; **publicEnrollment false**. This is local health/configuration evidence, not hosted-operation qualification. |

The classic debug APK is **125217918 bytes**, SHA-256 **`5FBBC33431E84B401B0FBEA137E646A3D3D6BF1EAB8767C180E1F811F4DFE594`**. It requires separately verified Metro JS/source **0c2d325**; package hashing does not embed/freeze that code or prove a signed release. Final documentation/push receipt pending. API/guarded cache-cleared Metro verified Home, observed PID 39240; do not assume/terminate that PID later. Earlier build timings retain scope. `FLAG_SECURE` was not bypassed.

### Native outage, readable review and own erase follow-up

Root used a bounded 84-second 503 outage while this author's native Journal was already unlocked. Edits and a confirmed local Save continued within the existing lease; normal two-minute idle subsequently locked the Journal. Root restored the ordinary route/map, reverified online and completed fresh device biometry. Selected in-memory readable review contained the saved offline page. Root then typed DELETE, completed fresh biometry and observed deletion confirmation plus **zero native journal files**. This verifies that scoped own-vault operation; previously sent/approved messages and external copies remain separate. The synthetic emulator-only PIN was cleared successfully afterward. Physical-device key/backup guarantees and native absolute lease-expiry timing are not established by these observations.

The host workaround uses unique attached incarnations and keys native Text/controlled TextInput by both font scale and display scale; four focused generation/density regressions are included in 260. It never keys Root/Journal/controllers or persists a text copy. Earlier hot-font measurements retain their scope; not every IME/stale-event timing was exercised natively.

### Native density profile failure and viewed retest

On one Pixel_10 emulator, the first small profile clipped Help to Hel/navigation labels and the tablet profile clipped navigation. After the density-aware host-key change, root viewed all labels readable/full navigation in the retest. [Original/retest PNGs and JSON results](../qa/production/p3/device-sizes/) are preserved.

| Emulator profile | Size / density | Viewed retest |
| --- | --- | --- |
| Small | 720×1280 / 320 | Readable Home/Help/full navigation |
| Large | 1440×3120 / 480 | Readable Home/full navigation |
| Tablet-shaped | 1600×2560 / 240 | Readable Home/full navigation |

Original **1080×2424 / density 420 / font 1.0** was restored. These are three window-manager profiles on one emulator, not three physical devices, physical tablet support, every-screen layout acceptance or spoken accessibility proof.

### Proven small-screen IME defect and final tap retest

The Android chat previously supplied no KeyboardAvoidingView behavior; Review stayed below the visible keyboard. An enabled automation node alone was not usable-control evidence. Source `0c2d325` uses one shared WritingKeyboardView below the real header/above navigation, measured via native frame coordinates, with padding on both platforms and a separate portal frame for Journal's modal. Chat header compacts while IME is visible. Owner state/keys and capture protections remain separate.

Root's final 720×1280/density 320 retest had keyboard shown, entire textbox 104 px (52 dp) and Review 98 px visible; an actual Review tap reached Send reviewed message. **The send control was not invoked.** [keyboard-results.json](../qa/production/p3/device-sizes/keyboard-results.json) and root's [native report](../qa/production/p3/NATIVE_QA_REPORT.md) record scope. Original 1080×2424/density 420/font 1.0 restored. This is one Android emulator case; native iOS keyboard and broader IME/composition/accessibility behavior remain untested.

Remaining external qualification: physical Android/strong biometry and shared devices, backup/restore/key loss, iOS build/runtime, spoken accessibility/model hardware, release signing, actual push/provider/device receipt, hosted Auth/API/SMTP/Realtime and operations, legal age/state/consent/journal-rights/retention decisions and trained report operators. Local service success does not authorize real-child data, public enrollment, actual transfers or publication. This documentation update ran no tests, services, ADB, database or Git operations.

## Earlier P3 continuation — 2026-11-16

Candidate `1116-ProductionFoundation-p3`, app `0.4.1`, Android code `3` / iOS build `3`, `feature/production-foundation`. Root reported base HEAD `338630a` with uncommitted UI changes. Final commit, artifact hashes and final native report are pending; none is inferred from this snapshot. All service/accounts/content in this continuation are fictional and local.

| Check actually reported by root | Result | Scope and qualification limit |
| --- | --- | --- |
| Local Supabase SQL 001–022 | Applied; **831 pgTAP assertions / 17 files PASS** | PostgreSQL authority/privacy/domain tests; most claims are synthetic. Proposed finance producer 023 is not applied or included. |
| Backend unit/type/build | **47 units, typecheck, build PASS** in prior combined run | Local package evidence, not hosted deployment or final later-source rerun. |
| Mobile unit/type/lint | **223 units, typecheck, lint PASS** | Before just-added font plugin and its five focused tests. New complete suite total/result is pending; do not report 228 by arithmetic. |
| Production browser | **15/15 PASS, 1.3 minutes** | After correcting missing custom-Conversation Help & safety link and Auth-gate fast-switch UI. Earlier 14/15 run remains a failed snapshot, not silently converted to a pass. |
| Original r12 demo browser | **19/19 PASS, 2.1 minutes** | Preserved fictional prototype; separate from production Auth/UI and native evidence. |
| Real managed Auth/HTTP | Prior **9 scenarios PASS** | Actual localhost Auth/server adapters and RPCs, separate from synthetic-claim SQL and unit doubles. No hosted SMTP/real VPC/support service. |
| Actual Realtime WebSocket | Prior **1 scenario PASS** | Immutable managed JWT remains connected while managed session is revoked; authorized positive-control listener continues, stale own listener receives no later hint. No hosted/load/device-push guarantee. |
| Android p3 debug transport build | **PASS, 26 seconds; installed** | Emulator/debug snapshot, not signed release or physical Android/iOS qualification. |
| Android font-scale plugin build | **PASS, 16 seconds; installed** | Compilation/installation after hot-font draft-loss fix. Actual hot-change retention retest is in progress. |
| Native exact-send response-drop / cold restart | **PASS for the scoped scenario below** | Explicit user retry after app death, server idempotency and cleanup; not exhaustive device/network/crash testing. |
| Native outbox ciphertext probe | Header **not SQLite**; fixture plaintext **not observed** | Root-observed local file probe. Does not prove every field/sidecar/key, forensic memory erasure or backup/restore. Journal directory empty after send. |
| Synthetic emulator biometric journal QA | **IN PROGRESS** | Not physical biometry, multi-author hardware isolation, restore or iOS evidence. |
| P3 native photos/report and final full-source checks | **Pending** | Root will supply exact evidence links, reviewed artifact identity, final counts and outcomes. |

### Native interrupted-send procedure actually observed

1. Root used a temporary loopback fault proxy to let the native explicit Review send reach the server, then discard its successful HTTP 200 response. UI retained the command as unknown.
2. Home and Journal navigation remained available while that thread's outcome was unknown. Root force-stopped the app and cold-restarted it.
3. Root explicitly chose **Find interrupted sends → Review original → Retry**. The original command reached saved/cleanup without a replacement nonce or automatic send.
4. PostgreSQL showed **exactly one message and one client UUID**. This proves the scoped exact-retry outcome, not recipient-device receipt or reading.
5. Root stopped the temporary proxy and restored the ordinary 54321 device reverse. No fault proxy or altered Auth route is part of the release configuration.

The outbox database resides in the distinct protected Android `no_backup/between-us-message-outbox` sibling. Journal storage remained empty after the send, so directory separation was observed without claiming first journal enrollment. Capture protection remains on for journal/chat/Review: do not bypass `FLAG_SECURE` to create screenshots.

### Failures retained and corrected source

The first production browser run passed 14/15; its custom Conversation omitted Help & safety. That link was added. A fast account switch exposed welcome Sign in before remote logout left the exclusive Auth gate; the UI now observes the read-only pending gate, while overlap still rejects instead of queuing. The later full production browser result is the separate 15/15 pass above.

The initial hot font-scale test lost its unsent draft and returned Home. A native config plugin fix was built/installed; the actual retention retest remains **in progress**. Do not treat the build or five new plugin cases as a passed native retest.

Other corrected continuation findings include expected-UID/session/navigation checks on pagination/thread results, stale-send UI commit guards, current-content CAS preserving newer drafts during old recovery cleanup, saved confirmation surviving an inaccessible history refresh, current-server-validation Auth cover, and separate native outbox/journal directories. Earlier nullable-case, identity metadata, SQL alias and lock-order failures remain recorded in the historical section. Source fixes and passing local tests are not independent security certification.

Root owns the final command transcript and full-source rerun. Established package commands include mobile `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:production-ui`, `npm run test:ui`, and backend `npm test`, `npm run typecheck`, `npm run build`; this documentation-only update did not run them. Exact final SQL/native/integration invocations and artifact hashes must accompany root's final report. [Launch the existing debug app](ANDROID_LAUNCH.md).

## Historical P1 verification log

2026-11-16. Build `1116-ProductionFoundation-p1`, branch `feature/production-foundation`. Work continues from the preserved r12 baseline `c301148536db955525d429600323bfbf39f751e3`. This is an interim evidence log; it is not release approval.

| Check actually run | Result | Scope |
| --- | --- | --- |
| Local Supabase migrations 001–010 | Applied | Official local Docker Auth/PostgreSQL stack, fictional accounts only; no hosted project created |
| PostgreSQL pgTAP | 413 assertions passed, seven files | Identity, communication, finance, privacy lifecycle, external contacts, notification receipts, check-ins |
| Managed Auth HTTP integration | Two scenarios passed | Actual signup hook, local Mailpit ownership verification, password recovery, distinct guardian/child sessions, required independent consent, child acceptance, role forgery/cross-family denial, immediate consent/session revocation |
| Existing r12 browser regression | 19 passed in 2.1 minutes | Original demo navigation, journals, blocking, check-ins, financial workflows, both themes/accessibility and local-model fallback |
| Mobile automated checks | Full typecheck/lint passed; most recent full specialist run 137 unit tests passed | Additional integration edits require the master's final rerun; focused session/message/finance regressions also passed |
| Android debug assembly | Passed, x86_64 | First native build 7m23s; updated app-switcher module build 23s; SQLCipher configuration enabled and protection module autolinked |
| Native runtime / physical devices / iOS | Pending | A successful compilation does not verify encryption, biometrics, backups, Android interactions, TalkBack or iOS |
| Actual push / hosted SMTP / hosted staging | Not performed | No provider credentials, paid resources, public enrollment or real child data used |

The master found and corrected a nullable SQL case-reader authorization bypass (migration 005), managed Auth rewriting enrollment metadata after creation (006/007), and a reserved SQL alias in the check-in migration before it applied. The failed checks were rerun successfully. Internal review also identified a receipt-batch lock-order defect: migration 012 now prelocks every involved family before relationship locks. An actual four-connection PostgreSQL regression passes and proves the first family is already locked while the worker waits on a different relationship. The combined managed-Auth/PG integration suite currently passes three scenarios; the final full SQL rerun remains scheduled.

Unit tests using substitute transports are labeled as such. Database tests execute real PostgreSQL transactions but most use synthetic Auth claims; the separate HTTP scenarios exercise actual managed Auth. Native screenshots and final interaction/security results will be added after runtime testing. No automated self-review constitutes independent security or legal certification.

## Staging r1 qualification - 2026-11-16

Staging r1 / engineering commit `10aba61d756a8d54f22ec03afc3287c638805060`: mobile **276** tests + type/lint PASS; backend **89** + type/build PASS; SQL **1,025 /21 files** PASS; real local managed Auth/SQL/Realtime integration **17** PASS. Final isolated production browser **16 PASS /1.8min** and preserved demo **19 PASS /1.9min**. Android debug475-task build/upgrade and three-platform Expo JS export PASS; no signed release/native iOS/physical push claim. Fresh26-migration SQL suite1,025 and restored SQL200 are separate runs, not added to the global count. An actual financial crash probe passed31 held-transaction assertions and rollback checks. The preceding shared-fixture browser run15/16 correctly rejected an over-budget chore; new isolated fixtures fixed repeatability without deleting history. [Receipts, source/artifact hashes, native limitations and commands](staging/FINAL_RELEASE_QUALIFICATION.md). Logs are retained privately in mobile `.expo/staging-*` and backend `.local/staging-*`; no credentials/traces are committed.
