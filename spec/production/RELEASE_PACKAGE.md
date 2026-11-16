# Reviewable release package

Prepared 2026-11-16. This package is documentation and source preparation, not a public release or legal/security certification. Owner authorization for publication, production resources, real children's data, paid services and signing remains outstanding.

The product name, approved logo and Open Letter visual system stay unchanged. Official tagline: **when it's hard to find the words, start here**. Safe Harbor light / Night Harbor dark are the approved themes; repository `docs/`, root `index.html` and historical Pages prototype remain a separate deliverable.

## Current P3 package checkpoint

Checked metadata: package/Expo version **0.4.1**, Android `versionCode` **3**, iOS source `buildNumber` **3**; family `1116-ProductionFoundation-p3`, `feature/production-foundation`. Backend additions: `467c530`; authenticated mobile integration: `07e333e`; final keyboard source: **`0c2d325`**. Final documentation commit/push and delivery receipt remain root work. An iOS number is not a native build, and this document creates no tag/approval.

| Package item | Current evidence / remaining receipt |
| --- | --- |
| Local service/source | SQL 001–024 applied; **926 assertions / 19 files PASS**. Backend **55 units + typecheck/build PASS**, with typecheck/build just rerun; **11 integration scenarios PASS**. Local managed Auth/messages/finance use fictional fixtures, not a hosted service. |
| Mobile checks | **260 units + typecheck/lint PASS after all fixes**, Doctor **20/20**, installed SDK check PASS, both audits **0 vulnerabilities**. Final post-keyboard production **16/16 PASS, 1.7 minutes**; demo **19/19 PASS, 2.1 minutes**. Earlier concurrent startup-failure logs preserved. |
| JS/assets exports | `--platform all` Android/iOS Hermes bundles and static web export (six routes) **PASS, exit 0**. This is not a native iOS build or signed embedded release. |
| Native Android | Guarded cold start, exact response-loss recovery with one UUID/message, journal enrollment/autosave/save/reflection/background lock with synthetic emulator fingerprint, font/focus retention, 84-second Journal outage/local Save/idle/review/erase and three viewed density retests passed within their stated scope. Final small-screen keyboard actual tap reached Review's Send screen without sending; native iOS keyboard untested. |
| Debug artifact | **125217918 bytes**, SHA-256 `5FBBC33431E84B401B0FBEA137E646A3D3D6BF1EAB8767C180E1F811F4DFE594`. Classic debug loads Metro JS; hash does not freeze source `0c2d325` or establish a signed embedded release. Latest guarded cache-cleared Metro PID 39240 is session provenance only; actual Home verified. |
| Evidence assets | **30 themed originals, 15/theme**, plus six resize originals, six comparison pairs and two contact sheets. Protected Journal/chat/Review were not captured. Keep `FLAG_SECURE`; do not publish private storage, credentials or protected-screen workarounds. Counts are image assets, not test cases. |
| Native pending | Absolute Journal lease expiry **not tested natively**; pure lease/SQL tests pass. Physical Android/biometry/restore, iOS, spoken accessibility and supported-device qualification remain gates. Three size profiles are one Pixel_10, not physical devices. |
| Signing/transport | Release cleartext denied; debug-release signing fallback removed and missing-owner-signing guard observed failing closed. No signed AAB/IPA or owner signing receipt is established. |
| Release operation | No hosted Auth/API/SMTP/device push, public/real-child enrollment, actual transfer, staffed report promise, store submission or main/public publication is approved by local tests. Legal/age/state/VPC/journal-rights, operators, finite retention/restore, costs and owner go/no-go remain open. |

Use [latest ledger](TEST_RESULTS.md), [handoff](FINAL_BUILD_REPORT.md), [device limits](SUPPORTED_DEVICES.md), [visual report](../qa/production/p3/VISUAL_QA_REPORT.md) and [guarded launch](ANDROID_LAUNCH.md). Original/retest density PNGs and [keyboard result](../qa/production/p3/device-sizes/keyboard-results.json) remain preserved; original 1080×2424/density 420/font 1.0 restored. Root will append final documentation/delivery receipts. Main/public demo remains unchanged; owner diagnostic preserved. No unfinished or physical qualification is inferred.

## Historical P1 preparation manifest

| Item | Current source / required final evidence |
| --- | --- |
| Source provenance | Architecture baseline `c301148536db955525d429600323bfbf39f751e3`; root records final feature-branch commit and any later changes. No commit/tag is created by this package. |
| Mobile identity | Source version 0.3.0, build family `1116-ProductionFoundation-p1`; `com.oxieg3n.betweenus` native identifiers currently in app config. Verify final generated manifests and increment store build codes under owner control. |
| Native Android | Reported x86_64 debug assembly passes (7m23s then 23s). Final artifact path, source commit, size, SHA-256 and install/runtime evidence must be recorded by the root. No release-signed AAB is established. |
| iOS | No iOS build, signed IPA, physical iPhone/iPad or App Store review evidence. |
| Backend | Independent `services/backend/` package, 0.1.0; Node 26.13.0, Supabase CLI 3.1.0, lockfile and ordered reviewed SQL migrations. Generated API bundle is ignored build output, not a deployment receipt. |
| Data / policy | Closed enrollment/real-data/operational flags; fictional local seed only. Reviewed jurisdiction/age/notice/consent/operator/retention decisions remain gates. |
| Evidence | [Release checklist](RELEASE_CHECKLIST.md) is the dated handoff snapshot; root final test/build ledgers supply exact integrated outcomes. Do not sum overlapping test runs or relabel r12 screenshots as production evidence. |
| Operations | Named launch owner, privacy/security/child-safety reviewers, report operator, backup/incident and budget owners all require approval and actual rehearsal. |
| Store assets | [Metadata drafts](store/METADATA_DRAFTS.md), [disclosure worksheet](store/DISCLOSURE_WORKSHEET.md), approved originals and future real screenshots only; no listing submitted. |

Exclude `.local/status.json`, local fixture passwords, JWTs/service keys, `.env*`, provider/signing credentials, mail-catcher contents, logs, database copies, journal/draft vaults, temporary exports and private screenshots from the review/public bundle. Check ignored files explicitly before packaging. A public client publishable key is still an environment identifier; a service key never belongs in a mobile bundle.

## Manual CI source

[production-checks.workflow.yml](release/production-checks.workflow.yml) is an **inactive owner-installable template**, configured for workflow_dispatch only. The first push was rejected because the current GitHub credential lacks workflow scope. No credential permissions were changed; no executable workflow is published by this branch. Its required `quota_reviewed` Boolean defaults false, so a dispatch without the reviewed free-quota acknowledgement skips the job. No push/PR/schedule or deployment trigger is added; no workflow is dispatched by this work. Making it discoverable on the default branch itself requires the owner's normal integration approval. GitHub documents the manual event/default-branch requirement in [manual workflow guidance](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

Official action pins were read from their own GitHub tag API and matching `action.yml` on 2026-11-16:

| Action | Reviewed immutable commit / source |
| --- | --- |
| Checkout v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` — [official commit](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1) |
| Setup Node v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` — [official commit](https://github.com/actions/setup-node/commit/949feb2413d6458794dcd2491c4babbbce0c15c1) |

Both actions use Node 24 internally; the application toolchain is separately pinned to Node 26.13.0. Checkout persistence and setup-node automatic package caching are disabled. Review new action source/pins before upgrades. GitHub recommends minimal permissions and verified full commit pins when dependency locking is unavailable. [GitHub secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).

`npm ci --ignore-scripts` uses both lockfiles without implicitly executing lifecycle hooks. Supabase CLI 3.1.0's reviewed npm shim resolves a pinned optional platform binary package; its installed package has no postinstall step. The workflow adds no setup-cli action or unrestricted global install. Native/model postinstall downloads are not silently reenabled; qualified native builds remain separate owner-run work.

The draft workflow runs type/lint/unit/build and an isolated local Supabase/SQL/Auth stack. Generated keys/status and raw integration output stay in ignored ephemeral files, never uploaded. It asserts default-closed database policy before fictional seeding. It stops only the disposable runner project; local owner databases must not use that cleanup recipe. No hosted secret, publication, signing, artifact upload or paid runner is configured. Standard runner and storage costs depend on repository/account/plan; the owner must inspect available free quota and spending controls rather than infer a free entitlement. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Static workflow review is not a successful GitHub run. The selected runner, package installation without scripts, all platform optional binaries, local Docker services and web build must pass an owner-approved actual CI run before claiming reproducibility there.

Static validation performed on 2026-11-16: the existing local YAML parser loaded the workflow; assertions confirmed the sole manual trigger, false quota default, read-only permissions, two full action commit pins, disabled credential persistence/cache and absence of secret interpolation/deployment/artifact steps. All 24 relative Markdown links across the 11 release/runbook/store documents resolved. Proposed short strings were checked at 28 and 71 characters. These checks do not execute GitHub Actions, Supabase, native tooling or any store submission.

## Handoff decision record

Before release, record: exact commit and artifact hashes; all active migration checksums; test dates/platforms/results and unresolved failures; reviewed legal states/ages and notices; actual operators/coverage; signing-key custodian; provider/project IDs and spending ceiling; backup/restore/tombstone evidence; store declarations/URLs; rollout cohort and rollback owner. Leave unknowns marked unverified. A reviewer approves the concrete candidate, not an aspiration or a green source-level checkbox.
