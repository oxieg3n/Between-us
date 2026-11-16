# Local production-foundation Android launch

2026-11-16. Current candidate `1116-ProductionFoundation-p3`, app `0.4.1` (Android code 3 / iOS source build 3). This procedure opens the already installed **debug** package `com.oxieg3n.betweenus` on the existing `Pixel_10` emulator from `feature/production-foundation`. Production mode uses actual local managed Auth, persisted messages and household finance with fictional fixtures; the isolated r12 demo remains separate. It does not authorize hosted enrollment, real child data, paid services, provider transfers or publication. Device push/hosted operations/legal/operator and physical/iOS/signing gates remain open.

## Start the existing debug application

The root operator must already have the existing local Supabase/Auth stack on port 54321, local API on 8787, the existing Pixel_10 emulator and installed native debug package. Prepare the ignored `apps/mobile/.env.local` with the reviewed local fixture procedure in [LOCAL_AND_CI](runbooks/LOCAL_AND_CI.md). Keep fixture credentials and raw service logs private. The helper neither starts the database/API/emulator nor installs/rebuilds a package.

From PowerShell:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs'
.\Scripts\Start-ProductionAndroid.ps1 -Serial 'emulator-5554'
```

Use the existing Pixel_10's actual serial if it differs; the helper verifies the AVD name before changing that selected emulator. An installed SDK in another directory can be supplied explicitly:

```powershell
.\Scripts\Start-ProductionAndroid.ps1 -Serial 'emulator-5554' -Adb 'D:\Android\Sdk\platform-tools\adb.exe'
```

The default expected branch is `feature/production-foundation`. A separately reviewed feature checkout can use `-ExpectedBranch 'feature/name'`; main/detached checkouts are refused. Read-only Git checks verify the branch and canonical root; the helper never changes them. The deprecated root must remain absent.

The helper checks that the ignored mobile environment exists, selects production mode with exact loopback Auth/API endpoints, rejects server-only settings/service-role keys, and never prints values. It checks local service health and the selected installed package's debug flag. It reuses Metro8081 only if `/status` is ready, its listeners are loopback-only, and Expo's `X-React-Native-Project-Root` header identifies this canonical mobile directory.

If port 8081 is free, it starts the **installed** Expo CLI through Node with `--localhost --port 8081 --clear`, working directory `D:\projects\BetweenUs\apps\mobile`, a hidden window and unique ignored logs under `.expo\production-launch\`. Clearing the new Metro bundle cache avoids stale substitutions between demo and account modes; it does not clear app data, vaults or credentials. Reusing an already ready server does not clear/reconfigure it, so verify its mode/fixture separately. Child-only `CI='false'` keeps Expo 58 watching/reloading; redirected output is noninteractive. Telemetry/public settings apply only to that child and caller environment is restored. Early-exit/readiness checks wait roughly 45 seconds. Occupied/wrong/unidentified listeners are refused; no 8082 fallback, port kill, package install, rebuild, global configuration or tunnel.

It adds or reuses only the selected emulator's identity-preserving reversals for 8081, 54321 and 8787. A conflicting existing mapping is refused. It verifies those mappings and starts only `com.oxieg3n.betweenus/.MainActivity`. The default does not force-stop an already open app; the optional restart below is explicit. It never clears application data. Android `Status: ok` confirms activity launch; the operator must still verify the actual Between Us welcome/build screen and account state in the emulator.

The hidden Metro process remains running after the helper returns. Its PID and private log directory are printed without configuration values. On startup failure, inspect/redact those ignored logs locally; the helper leaves processes running rather than killing a listener. Stop only a helper-started process after confirming its reported PID still belongs to this project; never apply a blanket node/port kill. Existing Metro started before environment/source changes may need a separately reviewed restart; the root header identifies the project, not its cached environment values.

Root's latest API refresh and guarded cache-cleared Metro launch verified Home; latest observed Metro PID was `39240` (earlier `5204` and `37860` are historical). Neither is a PID to assume or terminate later: revalidate process/project each session. Production tests reuse only with explicit `BETWEENUS_REUSE_QA_METRO=1`; see [test isolation](runbooks/LOCAL_AND_CI.md). Demo tests own 8084. Historical r12 8082 commands remain provenance, not current launch instructions.

## Recover a stale8082 bundle location

The root observed the native debug application retaining an old8082 host. Starting a healthy8081 server or changing `adb reverse` cannot overwrite React Native's stored `debug_http_host` preference. The installed React Native implementation reads this persisted host before its emulator default.

Use its supported UI:

1. Bring Between Us to the foreground on Pixel_10. Open the React Native developer menu using the emulator's menu gesture or the selected-device command below.
2. Choose **Change Bundle Location**.
3. Enter exactly **localhost:8081**, without an HTTP scheme or path.
4. Choose **Apply Changes**, then reload if requested.
5. If the old host remains cached, protect any writing you intend to retain using the explicit private storage controls, then perform the opt-in own-package restart below. Unprotected in-memory work will be discarded. Reopen the app and verify the actual welcome/build screen.

Commands for the **selected existing emulator only**, run separately by the root operator:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs'
$betweenUsAdb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$betweenUsSerial = 'emulator-5554'
& $betweenUsAdb -s $betweenUsSerial shell input keyevent 82
if ($LASTEXITCODE -ne 0) { throw 'Developer menu request failed.' }
```

After setting the location through that menu, the explicit own-package restart is:

```powershell
Set-Location -LiteralPath 'D:\projects\BetweenUs'
.\Scripts\Start-ProductionAndroid.ps1 -Serial 'emulator-5554' -RestartApp
```

**`-RestartApp` discards unsaved in-memory work.** After all canonical root/branch, environment, emulator/package, Auth/API, Metro and reverse checks pass, the helper warns, force-stops only the validated `com.oxieg3n.betweenus` package on the selected Pixel_10, verifies its package-specific `pidof` output is empty, and immediately launches its activity. A failed stop or nonempty verification output aborts relaunch. It does not stop unrelated apps, Metro, other listeners or ADB, and does not wipe persistent data. Omit the switch for normal non-destructive launch.

A red bundle-connect error can leave a failed ReactHost showing black even after Metro becomes ready. Once the supported bundle location is correct and Metro8081 is healthy, this explicit cold app restart may be needed instead of another activity start or reload. Root observed native Home restored after a cold restart and the initial Auth-cover patch; that observation does not replace visual/account verification on subsequent launches. The current helper uses `--localhost --port 8081`; Expo58 rejected the earlier simultaneous `--offline --localhost` flags, so do not add that combination back.

Do not edit app-private preference XML, use `run-as` to rewrite preferences, wipe application/emulator data, uninstall, remove its journal vault or kill ADB to fix this setting. The normal menu preserves application data. Physical devices and different AVDs need separate reachability/identity review; this helper intentionally rejects them.

## Debug and signed-release gates

The current classic native debug variant loads JavaScript from Metro and therefore requires8081 plus the three reverse mappings for local account services. It is not a standalone signed release and is not the Expo Go demo. A successful debug launch does not prove an offline embedded bundle, production signing, hosted Auth/API, push delivery, store readiness or physical-device behavior.

The current generated debug variant skips embedded JavaScript bundling by default. The production signing plugin **removes** the generated debug-signing fallback from release, clears release signing until valid owner material is supplied, and fails closed at its release guard if that material is missing. Root observed the actual Gradle guard fail as expected; that is a protective refusal, not a successful signed-release build. Native release cleartext is denied; current local debug transport/build passed. Owner-controlled signing, final embedded assets/manifests, release endpoint validation, supported physical devices and all legal/operational gates still require qualification. The launch helper performs no signing or native rebuild and changes no generated native files.

## Validation performed for this helper

Initial validation passed PowerShell AST parsing, including optional restart. Static review confirms canonical-root/feature checks, hidden Metro start, selected-emulator scope and three intended ports; sole force-stop is package-specific, opt-in and after reversals. PSScriptAnalyzer was not installed. Root subsequently observed guarded cold-start/native passes and latest cache-cleared watch-enabled Metro PID 39240/Home. This does not certify every error branch; root's report supplies exact evidence. This documentation update executed no launcher, ADB, service, native build or Git command.
