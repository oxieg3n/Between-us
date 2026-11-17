# Local validation and manual CI

Prepared 2026-11-16. Local synthetic development is authorized; this runbook does not approve real data, a hosted project, public networking, paid CI or deployment. One root operator owns Docker/migration/ADB/native operations. Preserve the existing local database and ignored files; do not reset it merely to obtain a green test.

Current mobile candidate is `1116-ProductionFoundation-p3` / app `0.4.1` on `feature/production-foundation`, canonical root `D:\projects\BetweenUs`. Production mode uses real local managed Auth, server message/finance persistence and distinct author-local storage, with fictional fixtures only. The isolated r12 demo remains memory-only and uses a different browser server. Public enrollment, provider transfers, real-child data, staffed operations and device push are not enabled by these steps.

## Exact PowerShell starts — local owner only

Verify canonical root and relocation before commands. The deprecated directory must remain absent. Use separate terminals and retain generated files privately; none of these commands was executed by this runbook author.

Backend preparation/start, after the root confirms no competing migration/runtime operation. Reuse an already healthy stack/API instead of launching duplicates. Docker/Node and the reviewed lockfiles must already be available; these instructions install no global tools. The optional package restore below is for a first setup and requires the build owner's review, not every app launch:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
if (Test-Path -LiteralPath 'D:\proejcts\BetweenUs') { throw 'Execute the relocation addendum first.' }
$env:SUPABASE_TELEMETRY_DISABLED = '1'
$env:DO_NOT_TRACK = '1'
New-Item -ItemType Directory -Path '.local' -Force | Out-Null
npm ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Backend package restore failed.' }
node .\node_modules\supabase\dist\supabase.js start *> .local\stack-start.log
if ($LASTEXITCODE -ne 0) { throw 'Local stack start failed; inspect the private log.' }
$localStatus = node .\node_modules\supabase\dist\supabase.js status --output json 2>.local\status-error.log
if ($LASTEXITCODE -ne 0) { throw 'Local status failed; inspect the private error log.' }
[System.IO.File]::WriteAllText((Join-Path (Get-Location).Path '.local\status.json'), ($localStatus -join [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))
node .\scripts\seed-local.mjs
if ($LASTEXITCODE -ne 0) { throw 'Local fictional policy initialization failed.' }
```

`start` may apply all active migrations. Review `.pending` source and the intended active migration/test list first; do not rename pending work or run against a linked/hosted project. Installed Supabase CLI 3.1.0 does not implicitly wrap migration files in transactions: reviewed migrations requiring atomicity/locks must contain their own `BEGIN` / `COMMIT`. Stop on every failed native command. Generated status contains local database/service credentials. The explicit UTF-8 writer avoids Windows PowerShell encoding/BOM differences; its ignored file is input to guarded scripts, never a report attachment or terminal dump. The seed rejects non-loopback service/database endpoints and initializes fictional engineering policy, including reviewed local privacy workflows, while leaving public/real-child/report/push capabilities closed. If startup fails, inspect/redact private logs locally; never paste them wholesale into chat/CI.

API terminal:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
npm run dev
```

The adapter reads ignored `.local/status.json` and binds `127.0.0.1:8787`. Do not expose it by binding all interfaces or opening a public tunnel. Device reachability/ADB reversal requires the serialized root operator and separate approved network setup.

First-time fictional mobile fixture, if `.local/mobile-fixture.json` does not already exist:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
if (-not (Test-Path -LiteralPath '.local\mobile-fixture.json')) {
    node .\scripts\mobile-fixture.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Fictional mobile fixture creation failed.' }
}
```

This fixture writes fictional credentials to ignored `.local/mobile-fixture.json` and public loopback configuration to ignored mobile `.env.local`; inspect credentials only privately on the local machine. It refuses differing existing mobile configuration and refuses an existing fixture unless its explicit replacement flag is supplied. Reuse current fixtures by default; replacement changes fictional identities and requires root review, not an automatic recovery step. The fixture does not verify legal VPC or staff a report service. Native/model build scripts skipped by `--ignore-scripts` need separate reviewed execution by the build owner; do not silently enable dependency lifecycle hooks.

For the existing installed debug app and Pixel_10, use the guarded launcher from the canonical repository root:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs'
.\Scripts\Start-ProductionAndroid.ps1 -Serial 'emulator-5554'
```

It verifies package/emulator, loopback services/configuration and project-owned Metro **8081**, starting only that Metro when free. New starts use `--clear` to avoid stale demo/production bundle substitutions; this does not reset app/vault data. Reuse does not clear cached configuration, so verify mode/fixture first. Conflicting listeners are refused; no static port/PID kill or fallback is permitted. Latest observed watch-enabled Metro PID 39240/verified Home supersedes historical 5204 and 37860; none is a reusable process identity. **Child-only `CI='false'`** keeps Expo 58 watching/reloading, while redirected output is noninteractive; caller environment restored. Do not set native Metro to `CI=1`.

The optional `-RestartApp` switch intentionally discards unsaved memory-only work, force-stopping only the verified app after its preflight/reverse checks; it does not wipe durable storage. See [exact Android launch and stale bundle-location recovery](../ANDROID_LAUNCH.md). Historical r12 8082 commands remain historical. Current debug transport/build has passed; release cleartext is denied and owner signing is required, with the missing-signing Gradle guard observed failing closed. No signed release/physical/iOS/device-push/hosted/legal/operator readiness is established.

## Production and demo browser isolation

Production Playwright uses the ignored local fictional fixture, port **8081**, and no implicit server reuse. When no Metro owns 8081, `npm run test:production-ui` starts its own configured web server. Its finite test-owned server uses CI mode intentionally; this is distinct from the watch-enabled long-lived native launcher. With an already running Metro, root must first verify canonical project identity **and** production mode/endpoints/fixture. `/status` alone and the project header cannot prove cached environment values.

Only after that verification, explicitly reuse it for this invocation:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\apps\mobile'
$priorQaReuse = [Environment]::GetEnvironmentVariable('BETWEENUS_REUSE_QA_METRO', 'Process')
try {
    $env:BETWEENUS_REUSE_QA_METRO = '1'
    npm run test:production-ui
    if ($LASTEXITCODE -ne 0) { throw 'Production browser checks failed.' }
} finally {
    [Environment]::SetEnvironmentVariable('BETWEENUS_REUSE_QA_METRO', $priorQaReuse, 'Process')
}
```

The isolated r12 demo suite owns **8084**, explicitly selects `EXPO_PUBLIC_APP_MODE=demo`, and refuses reuse. Before running it, quiesce native/production QA and stop Metro in its verified owner-started terminal. The guarded launcher checks both `127.0.0.1:8081` and `[::1]:8081` before starting Expo or clearing its cache; an active listener, unknown socket error or bounded probe timeout refuses the run. Do not kill a listener using a stale PID or start another pipeline during this check/run. Playwright owns and tears down the launcher/Expo process tree; the launcher does not detach or invoke a shell. These point-in-time checks supplement the serialized operator procedure. After demo teardown, use the guarded native launcher with its reviewed cache-clear/restart procedure before resuming native QA.

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\apps\mobile'
npm run test:ui
if ($LASTEXITCODE -ne 0) { throw 'Demo browser checks failed.' }
```

Run browser/native/service suites serially under the root operator. Do not repoint a production session to the demo, replace the native Metro with CI Metro or kill an unknown listener to make a test start. Screenshots/video/trace are disabled for the managed production browser suite; keep credentials and private logs out of artifacts.

## Verification commands

Run under the correct package, at one reviewed source snapshot:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs\services\backend'
npm run typecheck
npm test
npm run build
node .\node_modules\supabase\dist\supabase.js test db *> .local\sql-tests.log
if ($LASTEXITCODE -ne 0) { throw 'Local SQL tests failed; inspect the private log.' }
npm run test:integration *> .local\integration-tests.log
if ($LASTEXITCODE -ne 0) { throw 'Local managed Auth integration failed; inspect the private log.' }
Set-Location -LiteralPath 'D:\projects\BetweenUs\apps\mobile'
npm run typecheck
npm run lint
npm test
```

The real Auth tests exercise only loopback services and local mail capture. Do not replace their endpoints with a hosted project. Unit/type/build commands must also be checked individually for nonzero exit; PowerShell does not automatically stop every native executable failure. The root owns final test counts, exact source/artifact receipts and native evidence; a web export is not a signed native build. Stop the local API/Metro in their own terminals or target only a verified owner-started process. The serialized owner may use ordinary `supabase stop` to preserve local data; never use a destructive reset/`--no-backup` cleanup against an existing development database.

## Manual CI contract

The [manual CI template](../release/production-checks.workflow.yml) is inactive outside .github/workflows and has not been run. GitHub rejected the initial push because the current credential lacks workflow scope. The exact original commit is preserved locally at backup/production-workflow-e271973; no credential scope was changed. Before any dispatch, the owner reviews the exact commit, dependencies/action pins and account free quota/spend controls. Required `quota_reviewed` defaults false. No push/PR/schedule event, cache, artifact upload, signing secret, hosted token or deployment is configured.

An approved run uses one standard Ubuntu job, Node 26.13.0 and pinned Supabase CLI 3.1.0. The CLI's platform binary is an optional lockfile dependency; no unrestricted postinstall is enabled. Every stack is disposable and fictional, asserts default-closed policy, and keeps status/raw integration logs private. Only this ephemeral CI stack is retired with `stop --no-backup`. Failures print generic stage errors and must be reproduced locally for redacted diagnosis; do not add an automatic raw-log upload.

This workflow cannot establish physical Android/iOS, store signing, hosted SMTP/push, legal consent, staffed reports, full erasure or backup recovery. Keep those gates distinct in the final evidence record.

## Owner installation of inactive CI template

This is an external authorization step, not required to run local checks. Use an owner-approved GitHub credential with workflow permission; never paste its token into chat or source. Review the template, account free quota and default-branch integration policy first. Then copy spec/production/release/production-checks.workflow.yml to .github/workflows/production-checks.yml, commit on a feature branch and push with that authorized credential. Do not merge main or dispatch until the owner approves those actions. The required quota_reviewed input still defaults false.
