# Production foundation P3 build handoff

Final local delivery details, exact launch commands and owner actions: [delivery receipt](DELIVERY_RECEIPT.md). File-byte provenance: [source/migration/artifact manifest](release/SOURCE_MANIFEST.json). These do not approve public release.

2026-11-16. **Local synthetic candidate; release engineering remains incomplete.** Source is frozen at **0c2d325** with mobile 260/type/lint, final production browser 16/16, Android/iOS/web JS exports and the scoped native small-keyboard retest passing. Documentation receipt/push and external qualification remain open. This title is not release approval.

| Identity | Current snapshot |
| --- | --- |
| Build / app | `1116-ProductionFoundation-p3` / `0.4.1` |
| Native build numbers | Android version code `3`; iOS build number `3` is source configuration, not an iOS build |
| Workspace / branch | `D:\projects\BetweenUs` / `feature/production-foundation` |
| Source receipt | Backend `467c530`; authenticated mobile integration `07e333e`; final keyboard fix **`0c2d325`**. Final documentation receipt/push pending; no public-release approval inferred. |
| Preserved starting point | R12 baseline `c301148536db955525d429600323bfbf39f751e3`; historical prototype QA and public prototype assets remain separate |
| Artifact receipt | Classic debug APK **125217918 bytes**; SHA-256 `5FBBC33431E84B401B0FBEA137E646A3D3D6BF1EAB8767C180E1F811F4DFE594`. Current Metro JavaScript/source needs separate verification; not a signed embedded release. |

## Implemented local behavior

The production path now uses managed Auth and server persistence rather than a demo role selector. Guardian-managed setup applies to every child/teen, with distinct child credentials and current consent/session checks. The local API implements scoped family administration, independent accepted/verified contacts, bilateral blocks, 1:1 message history, confidential own/operator case workflows, authoritative finance, optional check-ins, and own-data exports/staged deletion within their documented blockers. Actual financial transfers, public report staffing and verified legal compliance are not operating claims.

Author journals/protected drafts remain device-local and separate from family administration and backend exports. Native explicit Send approvals use a separately keyed SQLCipher outbox in a fixed no-backup sibling directory. Its command retains the exact author/thread/peer/body/client UUID; recovery never automatically sends. Known saved/rejected terminal records perform cleanup only. Web remains explicitly memory-only for interrupted-send recovery. Device-only key loss can cause permanent loss; no guardian journal key or cloud journal sync is introduced.

The native response-drop scenario passed: the server saved the message while a temporary local proxy discarded HTTP 200; the UI kept an unknown outcome, allowed Home/Journal navigation, and survived force-stop/cold restart. Explicit Find → Review original → Retry resolved/cleaned the original command. PostgreSQL contained exactly one message and one client UUID. Root stopped the proxy and restored the ordinary 54321 reverse. This establishes that scoped emulator recovery case, not recipient-device delivery/read status, general crash safety or physical-device qualification.

Root observed a non-SQLite ciphertext header with no fixture plaintext in the probed outbox file. After the initial send, journal storage was empty; root subsequently enrolled the journal in its separate directory and passed autosave, explicit save, local reflection and background lock using **synthetic emulator fingerprint only**. This closes that scoped enrollment-after-outbox case, not physical biometry or restore. Actual font-scale follow-up also passed: heading 92→112 px at 1.0→2.0 with the same words, and focused 1.3 composer retained focus/accepted appended text; original 1.0 restored. Earlier failed builds remain in the [ledger](TEST_RESULTS.md) and [device investigation](SUPPORTED_DEVICES.md).

The [visual report](../qa/production/p3/VISUAL_QA_REPORT.md) inventories **30 themed originals, 15/theme**, plus six resize originals, six comparison pairs and two sheets. These are image assets, not test counts or accessibility certification. Journal/chat/Review capture protection stayed enabled; no protected screenshots or generated substitutes. [Root native report](../qa/production/p3/NATIVE_QA_REPORT.md).

Root's subsequent 84-second 503 outage kept an already unlocked native Journal editable with a confirmed local Save; normal two-minute idle locked it. After route restoration, fresh online verification/device biometry revealed selected saved offline writing in memory. Typed DELETE and fresh biometry confirmed own-vault deletion in UI and zero native journal files. The synthetic emulator-only PIN was then cleared. This is the scoped native outage/review/delete pass; **absolute lease expiry was not tested natively**, and two-minute idle is a different gate.

Initial density testing clipped small-profile Help/navigation and tablet navigation; original images/results remain preserved. After keying native text hosts on display scale as well as font scale, root viewed readable Home/full navigation at 720×1280/density 320, 1440×3120/density 480 and 1600×2560/density 240 on the same Pixel_10. Original 1080×2424/density 420/font 1.0 was restored. [Viewed retest evidence](../qa/production/p3/device-sizes/) qualifies only these emulator profiles. API was refreshed and guarded cache-cleared Metro verified Home, observed PID 39240; process identity must be revalidated later.

The later small-screen keyboard test exposed a real Android Review-under-IME defect. Final `0c2d325` uses shared measured-top padding across production branches, separate Journal modal avoidance and compact chat header while IME is visible. At 720×1280/density 320 with keyboard shown, textbox 104 px (52 dp) and Review 98 px were fully visible; an actual tap reached Send reviewed message, **without sending**. [Keyboard evidence](../qa/production/p3/device-sizes/keyboard-results.json). Original profile/font restored. Native iOS keyboard was not tested.

## Verification snapshot

| Check | Result / limitation |
| --- | --- |
| SQL 001–024 | Local applied; **926 assertions / 19 pgTAP files PASS** |
| Backend | **55 units + typecheck/build PASS; 11 integration scenarios PASS** |
| Mobile | **260 units + typecheck/lint PASS after all fixes**, source `0c2d325` |
| Tool/dependency checks | **Expo Doctor 20/20, installed SDK check PASS; both npm audits 0 vulnerabilities**. No security certification implied. |
| Production browser | **Final post-keyboard 16/16 PASS, 1.7 minutes**, source `0c2d325`. Prior 3.8-minute serial pass and concurrent 14/16 startup-failure logs preserved; no weakened test logic. |
| Preserved r12 browser | **19/19 PASS, 2.1 minutes**, serial/cache-cleared after an 8/19 concurrent-bundler startup-failure run. Ignored failure logs preserved. |
| Real local integration history | Prior **9 managed Auth/HTTP + 1 WebSocket PASS** are overlapping earlier evidence, not counts to add to current 11. No hosted/provider qualification. |
| Android p3 debug | Transport build **26 seconds PASS**; subsequent font-scale plugin build **16 seconds PASS**, installed |
| Native guarded cold start | Ready-Metro own-package cold start **PASS**, resolving observed black/red startup; no data wipe or general process kill implied. |
| Hot font-change retention | Scoped actual font growth, words/focus/continued typing **PASS**; original scale restored. Earlier failure retained. |
| Synthetic emulator biometric journal | Enrollment/autosave/save/local reflection/background lock **PASS**; physical/iOS biometry and restore not established |
| Finance notification producer / lease SQL | 023 and 024 included in 926 SQL pass; actual device push unverified. |
| Bounded offline Journal | Scoped 84-second outage/local Save/normal idle lock/fresh readable review/typed own erase **PASS**; native absolute lease expiry **not tested**. |
| Native size profiles | Three viewed density retests readable after the source fix; one Pixel_10 emulator, original profile restored. Physical/tablet qualification not implied. |
| Native keyboard | Final small Android IME/Review actual-tap case **PASS**, no send; native iOS untested. |
| Exports | `--platform all`: Android/iOS Hermes bundles and static web export (six routes) **PASS, exit 0**. No native iOS/signed-release claim. |

Counts are overlapping snapshots, not totals to add. A successful debug build does not qualify a signed release; focused plugin tests do not establish native font-change retention. See the [verification ledger](TEST_RESULTS.md) for retained failures, scoped procedure and later results.

## Remaining work and release blockers

- Attach root's final documentation/push receipt and verified Metro-source/artifact mapping. Source `0c2d325`, mobile 260, final browser/export passes and scoped native keyboard evidence do not establish external qualification. Native absolute lease expiry remains untested despite pure lease/SQL coverage.
- Qualify physical Android, strong biometry/shared OS accounts, device/key loss, backup/transfer exclusion and restore, spoken accessibility, model hardware behavior and iOS build/runtime. Emulator success does not approve these devices or key guarantees.
- Obtain owner-controlled release signing and inspect final release manifests/transport, permissions, artifact provenance and store declarations. Debug signing/configuration is insufficient.
- Review actual hosted Auth/database/API/SMTP/Realtime configuration, protected keys, origins/redirects/issuer/audience, quota/cost stops, backup/tombstone restore and incident operations. Actual push/provider/device notification delivery remains unverified; the locally tested finance producer is not that delivery proof.
- Name and approve legal/privacy/safety/operations owners. Resolve minimum/maximum age, nationwide candidate-state eligibility, notice/VPC/relationship verification, unsafe-guardian disputes, operator coverage, finite retention/holds/full deletion and COPPA parental rights versus device-only author journal custody. Guardian-mediated setup is required for every child/teen; checkbox/email control is not verification. These are substantive gates, not legal certification by this report.

Public enrollment/real-child data, paid resources, actual transfers, main merge and production/public publication remain unapproved. Draft runbooks/store policies and local operator fixtures do not operate a staffed service. [Release checklist](RELEASE_CHECKLIST.md), [security review](SECURITY_REVIEW.md) and [privacy review](CHILD_PRIVACY_COMPLIANCE.md) retain the detailed gates.

## Open the existing local debug build

Use the exact [Android launch procedure](ANDROID_LAUNCH.md), which checks the existing local services, package, emulator and canonical workspace. It is a debug launch, not deployment or a data reset. Root will update final README/QA links, commits and counts when the remaining checks finish.

## CI publication limitation

GitHub rejected the initial push because the current credential lacks workflow scope. CI is therefore retained as an inactive [owner-installable template](release/production-checks.workflow.yml); no credential permission was changed or executable workflow published. Original unpublished commit e271973 remains preserved locally at backup/production-workflow-e271973. Source commits through0c2d325 and all screenshot/report content are preserved. Owner workflow installation/dispatch remains a separate external gate.
