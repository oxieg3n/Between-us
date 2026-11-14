param([string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe")
$ErrorActionPreference='Stop'
if (!(Test-Path -LiteralPath $Adb)) { throw 'Set -Adb to your Android SDK adb.exe.' }
$evidence = Join-Path $PSScriptRoot '../../../spec/qa'
New-Item -ItemType Directory -Force $evidence | Out-Null
function Read-NativeTree {
 & $Adb shell uiautomator dump /sdcard/betweenus-smoke.xml | Out-Null
 $raw = & $Adb shell cat /sdcard/betweenus-smoke.xml
 if ($LASTEXITCODE -ne 0) { throw 'Could not read native accessibility tree.' }
 return [xml]($raw -join "`n")
}
function Assert-NativeText([string]$value) {
 $tree=Read-NativeTree
 if (!($tree.SelectNodes('//node') | Where-Object { $_.text.Contains($value) -or $_.'content-desc'.Contains($value) })) { throw "Missing native text: $value" }
}
function Tap-Native([string]$label) {
 $tree=Read-NativeTree
 $node=$tree.SelectNodes('//node') | Where-Object { $_.'content-desc' -eq $label -and $_.clickable -eq 'true' } | Select-Object -First 1
 if (!$node) { throw "Missing clickable native control: $label" }
 $numbers=[regex]::Matches($node.bounds,'\d+') | ForEach-Object { [int]$_.Value }
 & $Adb shell input tap ([int](($numbers[0]+$numbers[2])/2)) ([int](($numbers[1]+$numbers[3])/2))
}
function Screenshot([string]$name) {
 & $Adb shell screencap -p /sdcard/betweenus-smoke.png
 & $Adb pull /sdcard/betweenus-smoke.png (Join-Path $evidence $name) | Out-Null
}
# Start Metro and open this app in Expo Go before running this smoke check.
& $Adb shell input swipe 500 400 500 2100 400
Assert-NativeText "when it's hard to find the words"
Screenshot 'android-child-home.png'
Tap-Native 'Journal'
Assert-NativeText 'My Journal'
Assert-NativeText 'A little space to think'
Screenshot 'android-child-journal.png'
Tap-Native 'Parent'
Assert-NativeText 'Make room for'
Tap-Native 'Journal'
Assert-NativeText 'Finding a beginning'
$tree=Read-NativeTree
if ($tree.SelectNodes('//node') | Where-Object { $_.text -eq 'A little space to think' }) { throw 'Child entry leaked into parent journal.' }
Screenshot 'android-parent-journal.png'
Tap-Native 'Check-ins'
Assert-NativeText 'Open the Door'
Tap-Native 'Kid / teen'
Assert-NativeText 'A small start'
Write-Output 'PASS: Android role navigation, journals, cross-role entry exclusion and check-in destination.'
