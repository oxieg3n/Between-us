# Guarded deployment preparation

2026-11-16. **Offline tooling is implemented; hosted provisioning/deployment is not authorized or performed.** Supabase Free is selected. Public enrollment, real-child data, public reports and push stay off. Do not apply local seed/config to a hosted project. [Master mission](../MASTER_STAGING_RELEASE_QUALIFICATION.md), [prior rollback contract](../runbooks/DEPLOYMENT_AND_ROLLBACK.md).

## Commands currently safe to execute

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
node .\scripts\staging-preflight.mjs --local
if ($LASTEXITCODE -ne 0) { throw 'Offline preflight refused.' }
node .\scripts\staging-plan.mjs --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Offline plan refused.' }
```

Both scripts read only selected source/package/build files, migrations and non-secret metadata. They perform no HTTP, CLI subprocess, environment/credential lookup, link, deploy, policy write or service reconfiguration. Default plan prints **no executable remote commands** and `OWNER_APPROVED_STAGING_TARGET_REQUIRED`. The allowlist `services/backend/config/staging/approved-targets.json` contains zero targets. No hosted state is inferred from this inventory.

CLI is pinned to **3.1.0** in package and installed metadata, checked without execution. Pinned CLI `db push --help`, `functions deploy --help` and `link --help` were inspected read-only. Local inventories hash active migrations, backend source, shared mobile finance engine/types/calendar, mobile deployment resolver/client/app configuration/build label/package/lock, backend package/lock, local configuration, entry point, built bundle and plan/build scripts. Missing bundle, unexpected/pending migration, wrong CLI or symlinked selected file fails closed. A fingerprint identifies those bytes, not a successful build, source-to-bundle correspondence or live schema. Root rebuilds and repeats integrated checks before freezing a candidate, and records actual native/export artifact hashes separately; a debug shell using Metro does not freeze JavaScript.

`config/staging/*.env.names` contain **variable names only**, not runnable `.env` values. Mobile receives only public HTTPS endpoints and a publishable key; service/SMTP/database/push/signing secrets stay server/operator-only. New `BETWEENUS_*` names describe intended server integration; they are not claims that an ignored environment variable changes current policy. Root owns runtime validation/config integration. Store secrets only in owner-protected files/secret manager outside Git; never paste them in chat, PowerShell arguments, public env or reports. Existing ignored `.local` is not a substitute for OS access controls.

## Owner-controlled staging target admission — not executed

1. Owner explicitly authorizes one isolated synthetic Supabase Free staging project and region, checks eligible active-project count (maximum two), assigns quota/SMTP/backup/incident owners and verifies the current account stays Free without paid add-ons. No project creation, billing, DNS or credentials are authorized by these instructions.
2. Owner privately supplies approved credentials through protected injection. Record project metadata separately from secrets. Protect CLI account token and database password; any later command may require current scoped permissions. Do not create a privileged token merely to bypass a refusal.
3. Root and reviewer add the **same exact non-secret target object** to tracked `approved-targets.json.targets` and owner-private `services/backend/.local/staging/target.json`. Review the matching source entry in mobile `apps/mobile/src/production/deployment-target.ts` **at the same time**: `APPROVED_STAGING_TARGETS` currently stays empty, so environment variables alone cannot approve routing. Its canonical API URL must be `https://REF.supabase.co/functions/v1/api`, with the same project origin/ref as server metadata; production stays disabled. Mobile public configuration requires `EXPO_PUBLIC_DEPLOYMENT_ENVIRONMENT` and `EXPO_PUBLIC_SUPABASE_PROJECT_REF` alongside the existing endpoint/publishable-key variables. The private JSON is the only hosted target-file path accepted. Fields: `environment` = `hosted-staging`, `plan` = `free`, exact 20-lowercase-letter `projectRef`, actual `region`, `supabaseUrl` = `https://REF.supabase.co`, `allowedOrigins` = exact approved HTTPS origins, `authRedirectUrls` = exact origins plus `/auth/callback` and/or `between-us://auth/callback`, `syntheticOnly` = true, all four public enrollment/real-child/report/push fields = false, and reviewed `approvalId`. The exact field names are validated in `staging-preflight.mjs`; unknown fields are refused. The allowlist accepts at most one staging target; production is always refused in this mission.
4. Reconcile native callback scheme and issuer/audience, independent managed identities, CORS/web origins, storage/Data API exposure, JWT verification, staff/consent evidence and release feature policy. HTTPS URLs with credentials, wildcards, loopback, IP literals, query/fragment/encoding tricks or nonmatching redirect origin are rejected. Verify project/region/plan and current hosted settings in the owner dashboard; an offline JSON claim is **not provider verification**.
5. Run `node .\scripts\staging-preflight.mjs --target .local\staging\target.json`. Review output, exact migration inventory and build hash. Then `node .\scripts\staging-plan.mjs --dry-run --target .local\staging\target.json --confirm 'PLAN:REF:FINGERPRINT'`, substituting the exact reviewed non-secret ref/hash. A stale hash or different target refuses. This confirmation permits only printing an offline plan, never remote execution or deployment.
6. A later, separate owner approval must authorize the exact remote preview and then each write/deploy. Complete reviewed backup/restore and rollback evidence before modifying any nonempty target. Keep all actual operations serialized under root. Record target/source/artifact/config hashes, reviewers and policy results without credentials, private addresses or payloads.

## Future remote command semantics — printed only

The plan prints argv arrays using the installed CLI path, **explicit `--remote=REF`**, and named function `api`. It never executes them. Current CLI defaults database commands to local and otherwise may use ambient linked state, so do not omit the target.

- Migration preview: `db push --remote=REF --skip-vault --dry-run`. This is a **remote/network operation**, unlike our offline plan, and requires owner approval/credentials. Review its exact pending list before applying.
- Future migration apply: same command without `--dry-run`, only after approval. No `--include-seed`, `--include-all`, `--yes`, reset, rollback-history repair or local seed is added automatically.
- Function deployment: `functions deploy api --remote=REF`. **There is no `functions deploy --dry-run` in CLI 3.1.0.** Our tool only prints this future command. Never add `--no-verify-jwt`, `--prune`, or deploy every function by omitting `api`.

**CLI danger:** `db push` updates Vault secrets from configuration before migrations unless `--skip-vault` is supplied; keep it on both preview and apply. Reviewed current [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push), [explicit target semantics](https://supabase.com/docs/guides/local-development/local-and-hosted-projects). No `supabase link`, authenticated dry run or hosted command was performed by this work.

After approved deployment: verify migration history/checksums and all private schema/RLS/grants; assert every public/real-child/report/push gate closed; run bounded multi-session synthetic Auth/API/Realtime/finance adversarial tests; verify actual receipt, recovery email, blocked contacts and revoked sessions; then capture source/target/trace evidence. Local fakes or seed bypasses never authorize hosted VPC, staff access or enrollment. [Hosted evidence ledger](HOSTED_STAGING_TEST_RESULTS.md).

## Containment / rollback

An authorization, unknown quota or target mismatch stops admission and unsafe delivery; enrollment-off alone cannot stop existing Auth/direct RPCs. Root/operator contains the actual Data API and workers, revokes scoped sessions/authority and preserves minimal evidence. Public/offline safety resources remain available. Never weaken RLS/consent/session checks to restore availability.

Prefer reviewed forward migrations and an app rollback only to a security-qualified, schema-compatible artifact. No `db reset`, ledger truncation, destructive history edit or in-place restore over the surviving database. Restore into isolated access-denied infrastructure, replay later deletion/revocation tombstones, verify authorization and idempotency, then obtain explicit owner cutover approval. [Restore drill](BACKUP_RESTORE_DRILL.md), [incident operations](OPERATIONS_AND_INCIDENTS.md).

Credential rotation must include dependent services/mobile public key compatibility, Auth signing/session invalidation where applicable, SMTP/push/backup custodians and separately protected recovery copies. Rotate with provider-supported procedures after explicit owner approval; do not include secrets in argv/output. No live rotation, deployment, rollback, hosted plan verification or remote preview is established. Nine focused local tests plus typecheck pass; root owns the final integrated receipt.


## Canonical local PowerShell launch and qualification

Services and Pixel_10 were left available for this synthetic local handoff. Do not start a second listener on an occupied port. For first-time Docker/fixture preparation, use the existing `../runbooks/LOCAL_AND_CI.md` and keep credentials in ignored private files. No hosted provisioning is part of these commands.

In a backend terminal when the local API is not already running:

```powershell
Set-Location 'D:\projects\BetweenUs\services\backend'
npm run dev
```

Launch the installed debug application from another terminal; the helper reuses or starts the correct loopback Metro and verifies the existing Pixel_10 and three reverse mappings:

```powershell
Set-Location 'D:\projects\BetweenUs'
powershell -NoProfile -File .\Scripts\Start-ProductionAndroid.ps1
```

If Pixel_10 is off, start the existing AVD first and wait for Android boot; no wipe/new emulator is needed:

```powershell
Start-Process -FilePath "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -ArgumentList '-avd Pixel_10' -WindowStyle Hidden
```

Run units/source checks:

```powershell
Set-Location 'D:\projects\BetweenUs\apps\mobile'
npm run typecheck
npm run lint
npm test
Set-Location 'D:\projects\BetweenUs\services\backend'
npm run typecheck
npm test
npm run build
node .\node_modules\supabase\dist\supabase.js test db
npm run test:integration
node .\scripts\staging-plan.mjs --dry-run
```

For repeatable production-browser qualification, create a NEW isolated fictional family rather than exhausting an existing household budget. This prints only an ignored private fixture path and leaves the default fixture/environment unchanged:

```powershell
Set-Location 'D:\projects\BetweenUs\services\backend'
$fixtureRelative = (node .\scripts\mobile-fixture.mjs --isolated-ui-run).Trim()
if ($LASTEXITCODE -ne 0 -or $fixtureRelative -notmatch '^\.local/ui-runs/[a-f0-9]{32}/mobile-fixture\.json$') { throw 'Fixture creation failed' }
$env:BETWEENUS_PRODUCTION_UI_FIXTURE = [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $fixtureRelative))
Set-Location 'D:\projects\BetweenUs\apps\mobile'
npm run test:production-ui
Remove-Item Env:BETWEENUS_PRODUCTION_UI_FIXTURE
npm run test:ui
```

Serialize browser servers and native Metro. The test-owned production server uses8081, demo8084. Stop only your separately verified own Metro before starting test-owned8081, then use the canonical launcher to restore native service afterward. Do not kill an unidentified listener. These browser scenarios keep traces/video/screenshots of credentials disabled; actual native QA images are separate.
