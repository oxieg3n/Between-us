param(
    [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    [switch]$DiscardFictionalDrafts
)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $Adb)) { throw 'Set -Adb to your Android SDK adb.exe.' }
# Open the latest Between Us application in Expo Go before running this script.
# This script never installs a client, starts an emulator, or modifies journal entries.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidence = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../../../spec/qa/open-letter/smoke/$stamp"))
if (Test-Path -LiteralPath $evidence) { throw 'A smoke capture with this timestamp already exists; run again to preserve it.' }
New-Item -ItemType Directory -Path $evidence | Out-Null
$buildSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../src/build.ts') -Raw
$buildMatch = [regex]::Match($buildSource, 'BUILD_ID\s*=\s*"([^"]+)"')
if (!$buildMatch.Success) { throw 'Cannot determine the current build identifier.' }
$build = $buildMatch.Groups[1].Value

function Invoke-Adb([string[]]$Arguments) {
    $result = & $Adb @Arguments
    if ($LASTEXITCODE -ne 0) { throw "ADB failed: $($Arguments -join ' ')" }
    return $result
}
function Read-NativeTree {
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        $null = Invoke-Adb -Arguments @('shell', 'uiautomator', 'dump', '/sdcard/betweenus-smoke.xml')
        $raw = Invoke-Adb -Arguments @('shell', 'cat', '/sdcard/betweenus-smoke.xml')
        try {
            $tree = [xml]($raw -join "`n")
            if ($tree.hierarchy.node) { return $tree }
        } catch { if ($attempt -eq 2) { throw } }
        Start-Sleep -Milliseconds 250
    }
    throw 'The Android accessibility tree is unavailable.'
}
function Bounds($node) {
    $numbers = [regex]::Matches([string]$node.bounds, '\d+') | ForEach-Object { [int]$_.Value }
    if ($numbers.Count -ne 4) { return $null }
    return $numbers
}
function Display-Size($tree) {
    $root = $tree.SelectSingleNode('//node')
    $rectangle = Bounds $root
    if (!$rectangle) { throw 'Could not determine display dimensions from the Android tree.' }
    return @($rectangle[2], $rectangle[3])
}
function Visible-Node($node, $size) {
    if ([string]$node.'visible-to-user' -eq 'false') { return $false }
    $rectangle = Bounds $node
    if (!$rectangle) { return $false }
    $x = ($rectangle[0] + $rectangle[2]) / 2
    $y = ($rectangle[1] + $rectangle[3]) / 2
    return $rectangle[2] -gt $rectangle[0] -and $rectangle[3] -gt $rectangle[1] -and $x -gt 0 -and $x -lt $size[0] -and $y -gt 0 -and $y -lt $size[1]
}
function Find-Control($tree, [string]$label) {
    $size = Display-Size $tree
    foreach ($node in $tree.SelectNodes('//node')) {
        if ([string]$node.'content-desc' -cne $label -and [string]$node.text -cne $label) { continue }
        $candidate = $node
        while ($candidate.Name -eq 'node') {
            if ([string]$candidate.clickable -eq 'true' -and [string]$candidate.enabled -ne 'false' -and (Visible-Node $candidate $size)) { return $candidate }
            $candidate = $candidate.ParentNode
        }
    }
    return $null
}
function Scroll-Native([string]$direction) {
    $tree = Read-NativeTree
    $size = Display-Size $tree
    $x = [int]($size[0] * 0.5)
    $upper = [int]($size[1] * 0.28)
    $lower = [int]($size[1] * 0.76)
    if ($direction -eq 'top') { $start = $upper; $end = $lower } else { $start = $lower; $end = $upper }
    $null = Invoke-Adb -Arguments @('shell', 'input', 'swipe', "$x", "$start", "$x", "$end", '350')
}
function Tap-Native([string]$label) {
    $tree = Read-NativeTree
    $node = Find-Control $tree $label
    if (!$node) {
        # Reset toward the top, then search down the scroll surface. Tap positions
        # always come from the observed control bounds, never label coordinates.
        for ($index = 0; $index -lt 3 -and !$node; $index++) {
            Scroll-Native 'top'; $tree = Read-NativeTree; $node = Find-Control $tree $label
        }
        for ($index = 0; $index -lt 6 -and !$node; $index++) {
            Scroll-Native 'bottom'; $tree = Read-NativeTree; $node = Find-Control $tree $label
        }
    }
    if (!$node) { throw "Missing visible, enabled native control: $label" }
    $rectangle = Bounds $node
    $x = [int](($rectangle[0] + $rectangle[2]) / 2)
    $y = [int](($rectangle[1] + $rectangle[3]) / 2)
    $null = Invoke-Adb -Arguments @('shell', 'input', 'tap', "$x", "$y")
}
function Assert-NativeText([string]$value) {
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        $tree = Read-NativeTree
        $match = $tree.SelectNodes('//node') | Where-Object { ([string]$_.text).Contains($value) -or ([string]$_.'content-desc').Contains($value) }
        if ($match) { return }
    }
    throw "Missing native text: $value"
}
function Screenshot([string]$name) {
    $destination = Join-Path $evidence $name
    if (Test-Path -LiteralPath $destination) { throw "Refusing to overwrite $destination" }
    $null = Invoke-Adb -Arguments @('shell', 'screencap', '-p', '/sdcard/betweenus-smoke.png')
    $null = Invoke-Adb -Arguments @('pull', '/sdcard/betweenus-smoke.png', $destination)
}
function Set-DemoAccount([string]$role) {
    Tap-Native 'Profile & settings'
    $switchLabel = "Switch to $role demo"
    $opposite = if ($role -eq 'child') { 'parent' } else { 'child' }
    # The account control is below the appearance choices on smaller screens.
    for ($index = 0; $index -lt 6; $index++) {
        $tree = Read-NativeTree
        if (Find-Control $tree $switchLabel) {
            Tap-Native $switchLabel
            $tree = Read-NativeTree
            if ($tree.SelectNodes('//node') | Where-Object { [string]$_.text -eq 'Switch demo account?' }) {
                if (!$DiscardFictionalDrafts) { throw 'Unsent writing is present. Save it first, or rerun with -DiscardFictionalDrafts for disposable fictional test data.' }
                Tap-Native 'Confirm'
            }
            Tap-Native 'Home'
            return
        }
        if (Find-Control $tree "Switch to $opposite demo") { Tap-Native 'Home'; return }
        Scroll-Native 'bottom'
    }
    throw 'Could not find the demo account selector.'
}

$null = Invoke-Adb -Arguments @('get-state')
$tree = Read-NativeTree
if (Find-Control $tree 'Explore as Sam') { Tap-Native 'Explore as Sam' }
Set-DemoAccount 'child'
Tap-Native 'Profile & settings'
# Verify the running app has the current source build identifier.
for ($index = 0; $index -lt 4; $index++) { Scroll-Native 'bottom' }
Assert-NativeText $build
Tap-Native 'Home'
Assert-NativeText 'Hi, Sam.'
Assert-NativeText 'Some things are'
Screenshot 'child-home.png'
Tap-Native 'Journal'
Assert-NativeText 'Private to your demo role'
Assert-NativeText 'A little space to think'
Screenshot 'child-journal.png'
Tap-Native 'Revisit A little space to think'
Assert-NativeText 'Your private demo words'
Screenshot 'journal-editor.png'
Tap-Native 'Back'
Set-DemoAccount 'parent'
Assert-NativeText 'Hi, Alex.'
Screenshot 'parent-home.png'
Tap-Native 'Journal'
Assert-NativeText 'Finding a beginning'
$tree = Read-NativeTree
if ($tree.SelectNodes('//node') | Where-Object { [string]$_.text -eq 'A little space to think' -or [string]$_.'content-desc' -eq 'Revisit A little space to think' }) { throw 'Child entry leaked into the parent journal overview.' }
Screenshot 'parent-journal.png'
Tap-Native 'Home'
Tap-Native 'View check-ins'
Assert-NativeText 'Open the Door'
Screenshot 'parent-checkins.png'
Tap-Native 'Back'
Set-DemoAccount 'child'
Assert-NativeText 'Hi, Sam.'
$android = Invoke-Adb -Arguments @('shell', 'getprop', 'ro.build.version.release')
@("Build: $build", "Android: $android", 'PASS: native navigation, author-specific journal overview, editor, account switching and contextual check-in destination.', 'No messages were sent and no journal entries were changed.') | Set-Content -LiteralPath (Join-Path $evidence 'RESULT.txt') -Encoding utf8
Write-Output "PASS: $build Android smoke checks. Evidence: $evidence"
