param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$canonicalRoot = 'D:\projects\BetweenUs'
$deprecatedRoot = 'D:\proejcts\BetweenUs'
$scriptRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
if ($scriptRoot -ine $canonicalRoot) { throw 'Run the script from the canonical repository.' }
$gitRoot = (git -C $canonicalRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($gitRoot).TrimEnd('\') -ine $canonicalRoot) { throw 'Canonical Git root is not verified.' }
if ((git -C $canonicalRoot branch --show-current).Trim() -ne 'feature/mobile-foundation') { throw 'Unexpected branch.' }
if ((git -C $canonicalRoot remote get-url origin).Trim() -notmatch 'github\.com[:/]oxieg3n/Between-us(?:\.git)?$') { throw 'Unexpected origin.' }
if (Test-Path -LiteralPath $deprecatedRoot) {
    $oldItem = Get-Item -LiteralPath $deprecatedRoot -Force
    if (!$oldItem.PSIsContainer -or ($oldItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Old path is not an ordinary empty directory; inspect it.' }
    if (@(Get-ChildItem -LiteralPath $deprecatedRoot -Force).Count) { throw 'Old path contains data. Never overwrite or remove it automatically.' }
    if ($CheckOnly) { Write-Output 'New Git root verified. Old empty directory still exists; close old-path terminals/Codex before completion.'; exit 0 }
    $archiveName = 'BetweenUs.relocated-empty-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    $archivePath = [IO.Path]::GetFullPath((Join-Path 'D:\proejcts' $archiveName))
    if (!$archivePath.StartsWith('D:\proejcts\BetweenUs.relocated-empty-', [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $archivePath)) { throw 'Unexpected or occupied archive target.' }
    try { Rename-Item -LiteralPath $deprecatedRoot -NewName $archiveName }
    catch { throw 'Windows still holds the old empty directory open. Close old-path terminals/Codex; do not kill unrelated processes. Retry from the new directory.' }
}
if (Test-Path -LiteralPath $deprecatedRoot) { throw 'Old directory still exists.' }
Write-Output "COMPLETE: only canonical repository $canonicalRoot remains; old root absent."
git -C $canonicalRoot status -sb
