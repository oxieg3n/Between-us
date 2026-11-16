#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidatePattern('^emulator-[0-9]+$')]
    [string]$Serial = 'emulator-5554',
    [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    [ValidatePattern('^feature/[A-Za-z0-9._/-]+$')]
    [string]$ExpectedBranch = 'feature/production-foundation',
    [switch]$RestartApp
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repositoryRoot = 'D:\projects\BetweenUs'
$mobileRoot = Join-Path $repositoryRoot 'apps\mobile'
$packageName = 'com.oxieg3n.betweenus'
$metroUrl = 'http://127.0.0.1:8081/status'

function Invoke-CheckedNative {
    param([string]$Executable, [string[]]$Arguments, [string]$Stage, [int[]]$AllowedExitCodes = @(0))
    $savedPreference = $ErrorActionPreference
    try {
        # Capture native stderr privately; judge the exit code rather than echoing raw diagnostics.
        $ErrorActionPreference = 'Continue'
        $nativeOutput = @(& $Executable @Arguments 2>&1)
        $nativeExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    if ($AllowedExitCodes -notcontains $nativeExit) { throw "$Stage failed (exit $nativeExit). No other process was stopped." }
    return (($nativeOutput | ForEach-Object { $_.ToString() }) -join "`n").Trim()
}

function Test-LocalPort {
    param([int]$Port)
    # Any listener counts, including IPv6/all-interface listeners. Never kill or replace one.
    return @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
        Where-Object { $_.Port -eq $Port }).Count -gt 0
}

function Get-MetroState {
    try {
        $response = Invoke-WebRequest -Uri $metroUrl -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0
        $statusText = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
        if ($response.StatusCode -ne 200 -or $statusText.Trim() -ne 'packager-status:running') { return 'unavailable' }
        # Installed Expo middleware publishes this header; /status text alone cannot identify the project.
        $projectHeader = [string]$response.Headers['X-React-Native-Project-Root']
        if ([string]::IsNullOrWhiteSpace($projectHeader)) { return 'unowned' }
        $projectPath = [IO.Path]::GetFullPath([Uri]::UnescapeDataString($projectHeader)).TrimEnd('\', '/')
        if ($projectPath -ine $mobileRoot) { return 'unowned' }
        return 'ready'
    } catch { return 'unavailable' }
}

function Read-LocalMobileEnvironment {
    $environmentFile = Join-Path $mobileRoot '.env.local'
    if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) { throw 'Missing ignored apps/mobile/.env.local. Have the root prepare the fictional local fixture first.' }
    $localValues = @{}
    foreach ($line in [IO.File]::ReadAllLines($environmentFile)) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) { continue }
        $entry = [regex]::Match($line, '^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$')
        if (-not $entry.Success) { throw 'Local mobile configuration must use plain KEY=value entries. Values are not printed.' }
        $key = $entry.Groups[1].Value
        if ($key -match 'SERVICE_ROLE|PASSWORD|SECRET|PRIVATE_KEY|DATABASE_URL') { throw 'A server-only setting is present in mobile configuration. Have the root review it privately.' }
        if ($localValues.ContainsKey($key)) { throw 'Duplicate local mobile configuration entry. Values are not printed.' }
        $value = $entry.Groups[2].Value
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
        $localValues[$key] = $value
    }
    foreach ($key in @('EXPO_PUBLIC_APP_MODE', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_API_URL')) {
        if (-not $localValues.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($localValues[$key])) { throw 'A required local mobile setting is missing. Values are not printed.' }
    }
    if ($localValues.EXPO_PUBLIC_APP_MODE -cne 'production' -or $localValues.EXPO_PUBLIC_SUPABASE_URL -cne 'http://127.0.0.1:54321' -or
        $localValues.EXPO_PUBLIC_API_URL -cne 'http://127.0.0.1:8787') { throw 'This launcher accepts only production-foundation mode with the fictional loopback Auth/API endpoints.' }
    # Expo public variables belong in the bundle. Explicitly reject a service-role JWT in the public-key slot.
    $publicKey = $localValues.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if ($publicKey.StartsWith('sb_secret_')) { throw 'A server key cannot be used in mobile public configuration.' }
    if ($publicKey -match '^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$') {
        try {
            $payload = $Matches[1].Replace('-', '+').Replace('_', '/')
            $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
            $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
            if ($claims.role -cne 'anon') { throw 'Public key role rejected.' }
        } catch { throw 'Mobile public-key configuration is not an anonymous/publishable key. Values are not printed.' }
    } elseif (-not $publicKey.StartsWith('sb_publishable_')) { throw 'Mobile public-key format is not supported. Values are not printed.' }
    return $localValues
}

if (Test-Path -LiteralPath 'D:\proejcts\BetweenUs') { throw 'The deprecated root exists. Execute the workspace relocation addendum before launching.' }
if (([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')) -ine $repositoryRoot -or
    (Get-Location).Path.TrimEnd('\') -ine $repositoryRoot) { throw 'Run this canonical script from D:\projects\BetweenUs.' }
if ((Get-Item -LiteralPath $repositoryRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Canonical root must not be a relocation redirect.' }
$git = (Get-Command git.exe -ErrorAction Stop).Source
$actualRoot = Invoke-CheckedNative -Executable $git -Arguments @('-C', $repositoryRoot, 'rev-parse', '--show-toplevel') -Stage 'Repository root check'
if ([IO.Path]::GetFullPath($actualRoot).TrimEnd('\') -ine $repositoryRoot) { throw 'Git root differs from the canonical repository.' }
$branch = Invoke-CheckedNative -Executable $git -Arguments @('-C', $repositoryRoot, 'symbolic-ref', '--short', 'HEAD') -Stage 'Feature branch check'
if ($branch -cne $ExpectedBranch) { throw 'Unexpected feature branch. Review the checkout; this launcher never changes branches.' }
$localValues = Read-LocalMobileEnvironment
if (-not (Test-Path -LiteralPath $Adb -PathType Leaf)) { throw 'ADB is unavailable. Supply the installed SDK adb.exe with -Adb.' }
$Adb = (Resolve-Path -LiteralPath $Adb).Path
if ((Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'get-state') -Stage 'Selected emulator check') -ne 'device') { throw 'The selected emulator is not ready. Start the existing Pixel_10 separately.' }
$avd = Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'emu', 'avd', 'name') -Stage 'AVD identity check'
if (($avd -split '\r?\n')[0].Trim() -cne 'Pixel_10') { throw 'Selected serial is not the existing Pixel_10. No device was changed.' }
$installed = Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'shell', 'pm', 'path', $packageName) -Stage 'Installed package check'
if ($installed -notmatch '(?m)^package:') { throw 'The native package is not installed. Request a separately reviewed native build/install; no automatic rebuild is attempted.' }
$packageInfo = Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'shell', 'dumpsys', 'package', $packageName) -Stage 'Debug package check'
if ($packageInfo -notmatch '\bDEBUGGABLE\b') { throw 'This helper requires the installed debug package. Signed release launch is a separate gate.' }
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/health' -TimeoutSec 3 -MaximumRedirection 0
    if ($health.service -cne 'between-us' -or $health.publicEnrollment -ne $false) { throw 'Unexpected API.' }
    $authHealth = Invoke-WebRequest -Uri 'http://127.0.0.1:54321/auth/v1/health' -Headers @{ apikey = $localValues.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY } -UseBasicParsing -TimeoutSec 3 -MaximumRedirection 0
    if ($authHealth.StatusCode -ne 200) { throw 'Auth is not ready.' }
} catch { throw 'Local Auth54321/API8787 preflight failed. Start the reviewed local services separately; no raw response/configuration is printed.' }

$metroState = Get-MetroState
if ($metroState -eq 'unowned') { throw 'Port8081 serves a different/unidentified project. Its listener was left running.' }
if ($metroState -eq 'ready' -and @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
    Where-Object { $_.Port -eq 8081 -and -not [Net.IPAddress]::IsLoopback($_.Address) }).Count -gt 0) {
    throw 'Existing Metro8081 is not loopback-only. Review its owner/start command separately; its listener was left running.'
}
if ($metroState -ne 'ready') {
    if (Test-LocalPort -Port 8081) { throw 'Port8081 is occupied but the expected Metro status is unavailable. Its listener was left running.' }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $expoCli = Join-Path $mobileRoot 'node_modules\expo\bin\cli'
    if (-not (Test-Path -LiteralPath $expoCli -PathType Leaf)) { throw 'Installed local Expo CLI is missing. Dependency installation belongs to the root operator.' }
    $logDirectory = Join-Path $mobileRoot ('.expo\production-launch\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $logDirectory | Out-Null
    # Expo disables Metro file watching in CI; redirected output already prevents interactive prompts.
    $childEnvironment = @{ CI = 'false'; EXPO_NO_TELEMETRY = '1'; DO_NOT_TRACK = '1'; NODE_ENV = 'development' }
    foreach ($key in @('EXPO_PUBLIC_APP_MODE', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_API_URL')) { $childEnvironment[$key] = $localValues[$key] }
    $savedEnvironment = @{}
    try {
        foreach ($key in $childEnvironment.Keys) { $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process'); [Environment]::SetEnvironmentVariable($key, $childEnvironment[$key], 'Process') }
        if (Test-LocalPort -Port 8081) { throw 'Port8081 became occupied before launch. No listener was replaced.' }
        $startArguments = @{
            FilePath = $node
            # Demo and account builds substitute different public values in this same project.
            ArgumentList = @(('"' + $expoCli + '"'), 'start', '--localhost', '--port', '8081', '--clear')
            WorkingDirectory = $mobileRoot
            WindowStyle = 'Hidden'
            RedirectStandardOutput = Join-Path $logDirectory 'stdout.log'
            RedirectStandardError = Join-Path $logDirectory 'stderr.log'
            PassThru = $true
        }
        $metroProcess = Start-Process @startArguments
    } finally { foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') } }
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $metroProcess.Refresh()
        if ($metroProcess.HasExited) { throw "Metro exited before readiness (exit $($metroProcess.ExitCode)). Inspect its private ignored logs: $logDirectory" }
        if ((Get-MetroState) -eq 'ready') { break }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    if ((Get-MetroState) -ne 'ready') { throw "Metro did not become ready. No process was stopped. Inspect its private ignored logs: $logDirectory" }
    Write-Output "Metro8081 ready; helper-started PID $($metroProcess.Id). Private ignored logs: $logDirectory"
} else { Write-Output 'Reusing Metro8081 with the verified canonical mobile project root.' }

$reversals = Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'reverse', '--list') -Stage 'Existing reverse check'
foreach ($port in @(8081, 54321, 8787)) {
    $remote = 'tcp:' + $port
    $existing = @($reversals -split '\r?\n' | Where-Object { $_ -match ('(^|\s)' + [regex]::Escape($remote) + '\s+') })
    if ($existing.Count -gt 0 -and $existing[0] -notmatch ('(^|\s)' + [regex]::Escape($remote) + '\s+' + [regex]::Escape($remote) + '\s*$')) {
        throw "Selected emulator already has a conflicting reverse for port$port. Review it manually; no mapping was overwritten."
    }
    if ($existing.Count -eq 0) { $null = Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'reverse', $remote, $remote) -Stage 'Selected emulator reverse setup' }
}
$confirmed = Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'reverse', '--list') -Stage 'Reverse verification'
foreach ($port in @(8081, 54321, 8787)) {
    if ($confirmed -notmatch ('(?m)(^|\s)tcp:' + $port + '\s+tcp:' + $port + '\s*$')) { throw 'Selected emulator reverse verification failed.' }
}
if ($RestartApp) {
    Write-Warning 'RestartApp discards unsaved in-memory work in Between Us. Only the validated Between Us package on the selected emulator will be stopped.'
    $null = Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'shell', 'am', 'force-stop', $packageName) -Stage 'Own package stop'
    # Android pidof exits1 when this exact package process is absent; any output fails closed.
    $remainingPids = Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'shell', 'pidof', $packageName) -Stage 'Own package stop verification' -AllowedExitCodes @(0, 1)
    if (-not [string]::IsNullOrWhiteSpace($remainingPids)) { throw 'The own-package process was not confirmed absent after stopping. Relaunch was not attempted; review the selected emulator.' }
}
$launch = Invoke-CheckedNative -Executable $Adb -Arguments @('-s', $Serial, 'shell', 'am', 'start', '-W', '-n', ($packageName + '/.MainActivity')) -Stage 'Own package launch'
if ($launch -match '(?im)^\s*(Error:|Error type|Exception)' -or $launch -notmatch '(?im)^\s*Status:\s*ok\s*$') { throw 'Android did not report a successful own-package launch.' }
Write-Output "Launched the installed debug package on $Serial (Pixel_10). Verify the welcome/build screen in the emulator."
Write-Output 'If the app still requests8082: open React Native Menu > Change Bundle Location, enter localhost:8081, and Apply Changes. See spec/production/ANDROID_LAUNCH.md.'
