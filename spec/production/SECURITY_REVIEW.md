# Production threat model and verification ledger

Status: local security controls/qualification ledger, 2026-11-16; `1116-ProductionFoundation-p3`, app `0.4.1`, Android code `3` / iOS source build `3`, `feature/production-foundation`. Backend additions: `467c530`; authenticated mobile integration: `07e333e`; final keyboard source: **`0c2d325`**. Final documentation receipt/push remains pending. This is neither engineering completion nor independent security/legal certification. [Architecture](ARCHITECTURE.md) is authoritative; historical R12/P2 evidence remains preserved. Fictional local testing does not open enrollment, real-child data or publication.

## Latest P3 evidence and pending checks

Root reported SQL **001–024 applied, 926 assertions / 19 files PASS**; backend **55 units + typecheck/build PASS**, **11 integration scenarios PASS**; mobile **260 units + typecheck/lint PASS after all fixes**; Expo Doctor **20/20**, SDK compatibility and both npm audits **0 vulnerabilities**. Final post-keyboard production browser passed **16/16 in 1.7 minutes**; demo passed **19/19 in 2.1 minutes**. Android/iOS Hermes bundles and six-route static web export passed with exit 0. JS exports are not native iOS builds or signed-release qualification. Earlier concurrent-bundler 14/16 and 8/19 startup failures remain in ignored logs; test logic was not weakened. Counts overlap prior snapshots.

Actual emulator passes now include guarded own-package cold start after ready Metro; approved-send ciphertext and response-loss force-stop/cold-restart recovery with exactly one UUID/message; and separate-directory journal enrollment/autosave/save/local reflection/background lock using **synthetic emulator fingerprint only**. Hot font 1.0→2.0 showed heading 92→112 px with words retained, and a focused 1.3 composer kept focus/accepted appended text; original 1.0 restored. The latest visual inventory is **30 themed originals, 15/theme**, six resize originals, six comparison pairs and two contact sheets. Private Journal/chat/Review remained capture-protected and were not captured. See [latest ledger](TEST_RESULTS.md), [visual report](../qa/production/p3/VISUAL_QA_REPORT.md) and [device limits](SUPPORTED_DEVICES.md).

The bounded local-Journal lease uses exact online proof/current Auth/session/consent and a capped deadline; only already unlocked own native writing can continue during typed transient outage, never offline unlock or cloud finance/chat/protocol-denial fallback. Root passed an **84-second 503 outage/local Save**, normal two-minute idle lock, restored route/fresh online-device proof for selected in-memory review, and typed DELETE/fresh-biometric own erase with journal file count 0. Emulator-only synthetic PIN was cleared. **Native absolute lease expiry was not tested**; pure lease/SQL tests pass. Root also viewed readable Home/navigation on three density profiles after the host-key fix; originals/retests and restored original profile are in [device evidence](SUPPORTED_DEVICES.md). Final documentation/delivery and artifact-Metro-source mapping remain root receipts. Physical biometry/restore, iOS, signing, device push, hosted/legal/operator gates remain open.

The small Android keyboard test found Review below the IME because chat supplied no avoidance behavior. Source `0c2d325` uses a shared measured-native-top padding frame across production branches and a compact chat header while the IME is visible. The final 720×1280/density 320 retest showed the entire textbox (104 px / 52 dp) and Review (98 px); an actual tap reached **Send reviewed message without sending**. [Keyboard evidence](../qa/production/p3/device-sizes/keyboard-results.json). Original 1080×2424/density 420/font 1.0 restored. Native iOS keyboard behavior remains untested.

## Threats and mandatory controls

| Threat | Boundary/control | Required negative test |
| --- | --- | --- |
| Forged role/family/child ID | Managed Auth JWT plus current SQL session/membership; no client domain-role authority | Change every scope field; cross-family object/RPC access denied |
| Stolen/revoked session | Expiry/refresh rotation, current Auth session existence, account/device revocation | Previously valid JWT fails after sign-out/revocation, including subscriptions/fetch |
| Guardian impersonation/consent shortcut | Separate verified notice/consent/relationship facts; operator authority cannot come from user metadata | Parent cannot mark own child/contacts verified or self-grant staff |
| Parent reads journal/draft | No backend journal route/table/key; author-local vault and separate draft protection | Parent export/alternate UID/role switch cannot retrieve author content |
| Block/revoke race or stale subscription | Common relationship locking, recheck at creation/fetch/ack, no broadcast bodies | Parallel block/send, queued delivery, old tokens, reconnect denied |
| Duplicate money/spending | Trusted r12 domain, row lock + revision CAS, idempotent request fingerprint, append-only events | Parallel approval/allocation, changed-body replay, reverse/partial payouts, UTC/month boundary |
| Surprise matching inference | Server-only raw ledger/revision; child DTO and notifications derived solely from visible changes | Equivalent worlds yield identical child payloads/errors/signals; no hidden count/version |
| Unsafe guardian sees report | Reporter/assigned operator policies; confidential evidence; no family-admin default | Reported guardian/other staff/cross-family reader denied |
| Notification privacy leak | Neutral payload only; current session/contact check, opt-in/quiet hours | No names/body/journal/match amounts; stale token/skip causes no delivery |
| Data retention/recovery leak | Approved finite policy, explicit export/delete, separate journal keys/backups | Withdrawal/revocation, deletion retry, expired export, retained audit scope and restore |
| Hostile model/file/input | Pinned licensed asset/hash, bounded validated output and cancellation, no content network/logs | Injection, unsafe people, malformed/oversized output, stale role/background response |
| Resource abuse/billing surprise | Bounded requests, transactional actor/global quotas, plan lock/manual deploy | Over-budget requests fail before work, no unbounded notification/retry loop |
| App death repeats an approved message | Separate SQLCipher outbox preserves exact author/thread/peer/body/UUID before receipt/send; explicit recovery only; saved/rejected terminals never resend | Persist failure stops send; restore exact command; unknown/42501 stays uncertain; saved cleanup failure cannot retransmit |
| Async result crosses author/thread/navigation | Expected UID before dispatch, managed-session boundary, current author/generation/private epoch/navigation intent before UI commit | A completes after B login; earlier page/thread completes after later navigation; old recovered send cannot erase newer draft |

## Historical P2 local evidence and limits

Root reported the following results for this continuation. Counts are snapshot evidence, not additive totals or a final candidate rerun. Root-owned `TEST_RESULTS.md` and final build reporting must retain exact commands, source/artifact identity and later results.

| Evidence | Actual result and boundary |
| --- | --- |
| Local PostgreSQL/Auth migrations 001–022 | Applied on localhost; latest full pgTAP run **831 assertions / 17 files PASS**. Most SQL cases use synthetic claims; actual managed Auth is separate evidence. No hosted migration/project is established. |
| Backend | **47 unit tests, typecheck and build PASS** in the prior combined run. This does not qualify deployed service operation. |
| Mobile | **220 unit tests, full typecheck and lint PASS** before the latest small Conversation safety-link UI change. Final integrated rerun is still required. |
| Managed Auth/HTTP and Realtime | Prior real local **9 HTTP scenarios PASS**, plus **1 actual WebSocket scenario PASS**. Realtime used immutable managed JWTs and a distinct positive control to show revoked-session own hints stop while an authorized listener continues. Hosted Realtime, load/capacity and provider/device delivery remain unverified. |
| Android p2 debug build/transport | Root reported **29-second build PASS and installation**, for that source/native snapshot. Native parent explicitly sent from Review and observed server-saved outcome. Root observed its SQLCipher database in distinct `no_backup/between-us-message-outbox` while the journal directory remained empty. This is not kill/restart recovery, first journal enrollment, outbox wrong-key proof, signed-release or physical-device evidence. |
| Production browser interactions | First run **14/15 PASS**; missing Help & safety link in the custom Conversation screen was corrected. The full 15-case rerun is **in progress**, not a pass at this snapshot. |

At that P2 checkpoint, interrupted-send/process-death recovery and further device checks were in progress. The later scoped passes are recorded above; these historical results are not relabeled. Physical strong biometry/shared devices, backup/restore, iOS, actual push, hosted operations, signing and independent reviews remain open.

## Findings corrected in this continuation

These are source changes with the evidence limits above; they are not independent certification of every race.

- Pagination/thread loads now bind expected author and captured account/private lifetime, then check the current navigation intent before committing results. An older page or conversation response cannot replace a later navigation choice merely because it belongs to the same family.
- Send completion now rechecks its captured reviewed scope after optional history refresh. A stale account A completion cannot place its saved notice into account B. Saved confirmation stays distinct from a later denied history fetch: an inaccessible former-family thread does not turn the saved message into a failed send or leave an empty Review screen.
- Successful old-command recovery clears memory-only words by exact current-content CAS and removes only its matching recovery-list entry. A newer, separately composed draft in that thread survives cleanup of the old approved command.
- Initial/foreground Auth validation uncovers only a current server-validated replacement, including when an initial Auth event supersedes a foreground request. Revoked users retain only the separately authorized own-privacy portal; no chat/finance authority is restored by that path.
- Author-wide background/idle clearing removes never-attempted staged words/reports/preparations and invalidates old draft handlers. Attempted/adopted commands retain their immutable UUID and words for retry but their review is hidden. Per-thread uncertainty does not globally prohibit Home or unrelated conversations.
- The original outbox shared-directory collision with strict journal orphan checks was corrected with a **distinct fixed native sibling directory**, separate from journal/drafts. The native adapter uses `prepareMessageOutboxDirectory` / `protectMessageOutboxDirectory`; missing native capability fails closed. Legacy outbox files under the earlier journal directory are not silently moved, deleted, reset or replaced. The initial P2 first-enrollment/recovery gates later gained the scoped emulator evidence above; physical/restore qualification remains open.
- Conversation's custom list includes Help & safety. The initial 14/15 failure and subsequent 15/15 pass remain historical; latest serial 16/16 passed. Native font/density hosts use unique committed incarnations, preventing old same-scale callbacks from replacing newer writing; four focused regressions are included in the 260 mobile total.

Android `FLAG_SECURE` protects journal, conversation and Review. Blank/blocked protected screenshots are expected protection, not permission to disable it. Do not bypass native capture controls for QA evidence or store assets. Use nonprivate fixture surfaces or separately approved illustrative assets, and verify protected flows through permitted assertions without exposing content.

## Standards and scope

Use OWASP [ASVS 5.0](https://asvs.owasp.org/) requirements for authentication, sessions, authorization, validation, cryptography, data protection, logging and configuration; map implemented evidence rather than claiming blanket compliance. Use [MASVS](https://mas.owasp.org/MASVS/) STORAGE/CRYPTO/AUTH/NETWORK/PLATFORM/CODE/RESILIENCE/PRIVACY groups for native vault, token custody, transport, backups, local inference and shared-device lifecycle. Third-party testing and legal/privacy review remain release gates.

## Data classification and keys

Authentication credentials/session tokens are secrets held by Auth/platform stores. Family/consent and intentionally sent messaging/financial data are sensitive server records with explicit object authorization; deployed TLS/provider-at-rest settings still require hosted qualification. This is not an E2EE claim. Journal/draft content and keys stay author-local and never join the family ledger, server exports, notifications or model servers. Operators cannot silently recover journal keys.

The approved-message outbox contains only explicit Send-approved commands, not journal or unsent-draft copies. Its separate per-author/issuer SQLCipher key uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, without the journal's strong-biometric access requirement. Native storage is a separately protected fixed no-backup sibling; key loss does not generate a replacement over existing ciphertext. Known saved terminals are cleanup-only, and absent receipts remain unknown. Web explicitly has memory-only recovery. See [outbox design and limits](MESSAGE_OUTBOX.md). Local device compromise, an unlocked shared OS account, OS keyboard behavior, forensic memory erasure, key loss and biometric multi-author limitations remain risks requiring physical-device review.

## Open release gates

- Public enrollment, actual child information, verified-consent claims and staffed reporting promises OFF.
- Hosted service/SMTP/push/signing configuration and deployment require approved owner setup and actual qualification. Local fixtures, local mail capture and debug installation do not satisfy them.
- Native process-death outbox recovery and first journal enrollment after outbox use now have scoped emulator passes. Broader interruption/account-change cases, outbox wrong-key/missing-key/device loss, physical strong biometry, shared-device access, backup/transfer exclusion and restore/tombstone drills remain unverified. Earlier journal/SQLCipher evidence must not be relabeled as new outbox hardware proof.
- Retain the scoped outage/review/erase and browser passes without claiming native absolute lease expiry, every crash/IME/layout case or physical qualification. Complete final source/artifact/Metro-JS/evidence receipt; no signed embedded release is established by a debug APK hash.
- Physical Android/iOS, spoken accessibility, hardware model/memory testing and signed release artifacts remain unverified. Keep capture protection enabled while qualifying journal/chat/Review.
- Operator staffing/response coverage, unsafe-guardian/dispute handling, consent/relationship verification policy, youngest/maximum age, state eligibility, finite retention/holds/full deletion and under-13 parental rights versus device-only journal custody require named owner/legal/operational decisions. Guardian-managed setup remains mandatory for every child/teen age; policy defaults stay closed.
- Independent security review must cover external contact/guardian changes, issuer/audience deployment configuration, session revocation, concurrent authorization/retention limits, confidential case access, child hidden-matching equivalence and release transport settings. A passing local suite cannot approve these release capabilities.
- Track every implemented test and unresolved finding in TEST_RESULTS.md/RELEASE_CHECKLIST.md; failed runs must remain distinguishable from passes.
