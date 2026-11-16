# P3 local engineering delivery receipt

2026-11-16. **Implemented and tested local synthetic foundation; not approved for real children or public release.** Current build `1116-ProductionFoundation-p3`, app `0.4.1`, Android version code3 / iOS source build3. Work remains on `feature/production-foundation` at `D:\projects\BetweenUs`, origin `https://github.com/oxieg3n/Between-us.git`. This receipt supersedes pending local-test notes in earlier snapshots; external release gates remain open.

## Source and preservation

| Commit | Milestone |
| --- | --- |
| `c301148536db955525d429600323bfbf39f751e3` | Preserved r12 baseline, ancestor of this work |
| `338630a` | Local managed account, communication and transactional finance services |
| `e77b725` | Scoped conversation paging and current-session realtime authorization |
| `467c530` | Financial notification processing, retention lock regression and own-session Journal lease; migrations023/024 |
| `07e333e` | Authenticated mobile workflows, author vault, separately keyed approved-send recovery and native display safeguards |
| `0c2d325` | Final application source: shared measured keyboard frame and usable small-screen composer |

Documentation/evidence commits follow the application-source receipt; obtain the final branch tip with `git -C 'D:\projects\BetweenUs' log -1 --oneline`. No main merge, force push or public deployment. `docs/` and root `index.html` match the r12 baseline. The deprecated root is absent. The intentionally untracked diagnostic is preserved, SHA-256 `34ACB427BF1F0A4A1749104A4066BB389A54680641C2F9437FDFDC4186F8C56C`. No relocation restart is required; this session already operates from the canonical root.

## Actual final checks

| Check | Result |
| --- | --- |
| Mobile TypeScript / lint / unit | PASS / PASS / **260 PASS**, after the final keyboard change |
| Backend TypeScript / build / unit | PASS / PASS / **55 PASS** |
| PostgreSQL local migrations001–024 | Applied; **926 assertions /19 files PASS** |
| Real local backend integration | **11 PASS**, including managed Auth/email/recovery/MFA, distinct family identities, concurrent finance, actual WebSocket revocation and retention/hold locks |
| Production browser | **16/16 PASS,1.7minutes**, final source after keyboard corrections |
| Preserved demo browser | **19/19 PASS,2.1minutes**, serial/cache-cleared; later keyboard changes are production-only |
| Expo Doctor / SDK compatibility | **20/20 PASS** / dependencies up to date |
| npm audit, both packages | **0 known advisories**; not a native supply-chain audit or independent certification |
| Android / iOS JavaScript / static web export | All PASS via `expo export --platform all`; six web routes. iOS JavaScript success is **not** an iOS native build/runtime test. |
| Android debug shell | Built/installed; native transport guard passed. Final native interaction evidence is linked below. |
| Release signing | Expected fail-closed refusal without owner material; **no signed release produced** |

Earlier concurrent-bundler runs had14/16 and8/19 passes with startup failures; serial execution/cache clearing corrected them. Earlier real native defects—stale Metro location/failed host, startup privacy cover, font recreation/stale text, callback-generation ABA, density clipping and keyboard overlap—were fixed and relevant checks repeated. Historical evidence and failed captures remain preserved. No test was weakened to obtain a pass.

The native debug APK is **125217918 bytes**, SHA-256 `5FBBC33431E84B401B0FBEA137E646A3D3D6BF1EAB8767C180E1F811F4DFE594`. It loads current JavaScript from project-verified Metro8081; its hash identifies the native shell, not an embedded signed release. Final exports are ignored local artifacts under `apps/mobile/.expo/export-p3-final/`, not public deployments.

## Working behavior and limits

The configured local stack performs real managed authentication, per-session/family/consent authorization, accepted/verified restricted contacts, message persistence/retrieval, blocking, transactional financial command processing, optional check-ins, notification preferences and restricted case/privacy workflows. All accounts/content are fictional. Guardian-managed setup is required for **every child/teen age**, with distinct child credentials; it is never an ordinary role switch.

Author-local journals and protected private drafts use SQLCipher/device keys with no family-admin key or automatic backend synchronization. Explicitly approved sends have a separate device-only encrypted outbox; exact-UUID interrupted-send recovery was tested through dropped response, process death and deliberate review/retry. An84-second injected connection outage preserved an already unlocked Journal's local edits/save; normal inactivity locked it. Fresh selected-page in-memory review and typed/fresh-auth whole-author-store deletion passed. These observations do not prove physical biometry, all crash/restore cases or native absolute15-minute expiry. [Detailed native evidence](../qa/production/p3/NATIVE_QA_REPORT.md).

The final small-screen keyboard case showed the complete52dp writing field and49dp Review button above a visible IME; an actual tap opened explicit send review. No Send was pressed. Hot font changes retained words/focus/continued typing; small/large/tablet Home density profiles were checked on one resized emulator, then original settings restored. Temporary synthetic emulator credential was cleared after own-vault erasure.

Financial values are bookkeeping records, not provider balances or custody. Matching is initially OFF until parent confirmation; the configured default remains100%, $20 monthly shared cap per child, Surprise/manual reveal with separate parent budget. Cash App/Venmo/manual handoff and parent-reported reconciliation do not execute money transfers. Local journal templates/native model adapter remain on-device; no paid/cloud inference. Current production-path fallback/storage cases are tested; historical r12 emulator model evidence does not qualify physical production inference.

Notification producer/worker and privacy/report APIs are implemented and tested locally, but push delivery, public confidential-report staffing, legal VPC/identity verification, hosted email and complete cross-provider/account erasure are **not operational claims**. Selected journal JSON review is not a completed encrypted portable backup. The isolated demo remains simulated and memory-only.

## Actual Android review package

[Screenshot folder](../qa/production/p3/), [visual report](../qa/production/p3/VISUAL_QA_REPORT.md), [native interaction report](../qa/production/p3/NATIVE_QA_REPORT.md), [hash manifest](../qa/production/p3/SCREENSHOT_MANIFEST.json).

There are30 themed originals, six additional size originals, six full-resolution comparison pairs and two overview sheets. Protected Journal, active chat and Review were interacted with but not captured; capture protections were never disabled and no generated/browser substitute is presented as Android evidence.

- [Child Home](../qa/production/p3/comparisons/home-child.png)
- [Parent Home](../qa/production/p3/comparisons/home-parent.png)
- [Circle](../qa/production/p3/comparisons/circle-child.png)
- [Conversations list](../qa/production/p3/comparisons/conversations-list.png)
- [Appearance](../qa/production/p3/comparisons/appearance.png)
- [Child finance](../qa/production/p3/comparisons/finance-child-overview.png)

## Exact local launch and checks

The existing local Auth/API services, fixture configuration and Pixel_10 must be healthy. Reuse the running API/Metro rather than starting duplicates. The launcher verifies ownership and refuses conflicting listeners:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs'
.\Scripts\Start-ProductionAndroid.ps1
```

If only the API has stopped, start it in a separate terminal first:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
npm run dev
```

Mobile checks:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\apps\mobile'
npm run typecheck
npm run lint
npm test
```

[Complete first-time/local-service/browser/native commands](runbooks/LOCAL_AND_CI.md), [guarded Android recovery](ANDROID_LAUNCH.md). `-RestartApp` deliberately discards unprotected in-memory work; it never wipes persistent storage. Run production/demo bundlers and native work serially. CI is preserved as an [inactive owner-installable template](release/production-checks.workflow.yml), not an executable repository workflow. GitHub rejected the first push because the current credential lacks workflow scope. No credential permissions were changed. The original unpublished commit is retained at local branch backup/production-workflow-e271973; application history and all CI content remain intact. No CI run was dispatched or billed.

## Owner actions before the next release qualification

1. Assign privacy counsel and a child-safety operator; approve eligible states/ages, VPC/relationship methods, child recovery, notices/teen grants, unsafe-guardian disputes, finite retention, full deletion and COPPA parental rights versus device-only journal custody. Broad U.S./young-preteen intent is preserved; unreviewed enrollment remains denied.
2. Approve a separate fictional hosted staging project/region and supply credentials through protected configuration; approve SMTP/domain ownership, budget alerts/hard stops and an operated backup/tombstone replay destination. No paid plan is activated automatically. Local hosting service spend introduced by this work is$0; free hosted quotas do not guarantee permanent zero cost or availability. [Current comparison/costs](COST_ANALYSIS.md).
3. Provide supported physical Android hardware and macOS/iOS test access; complete TalkBack/VoiceOver, device/key loss, backups/restore, local-model memory/cancellation and actual notification delivery. Supply owner-controlled signing material outside the repository and store/developer-account access when release preparation is authorized.
4. Complete independent security/privacy/accessibility review, hosted/recovery/operator drills, notices/native/model license inventory and final signed-artifact checks; then explicitly approve public deployment/store submission. Do not enroll real children or claim production readiness before the [release gates](RELEASE_CHECKLIST.md) pass.

These are unresolved external/policy/qualification gates, not approval requests hidden in routine development. No credentials should be pasted into chat, committed or embedded as private mobile secrets.

## Coordination and review

Bounded specialist work used separate file ownership: `production_journal` implemented/reviewed author storage, draft/model lifetime, local lease and own-store controls; `production_privacy` covered policy research, session/error boundaries, privacy/realtime reviews, native text-host fixes and final documentation; `production_costs` covered provider/cost/release work, financial notification processing, pending-command recovery and faithful screenshot organization. Root reviewed integration, owned shared account/navigation/backend work, and ran the serialized actual database, browser, build and emulator checks. These are collaborating engineering reviews, not independent security/legal certification.
