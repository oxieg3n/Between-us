#Requires -Version 5.1
<#
Run only after Root confirms all eight final native captures are ready.
Pin their SHA-256 values in a hashtable keyed light/<filename> and dark/<filename>.
Example: & .\CREATE_COMPARISONS.ps1 -ExpectedSourceHashes $approvedCaptureHashes
No capture, build, installation, ADB, network, Git or database operation is performed.
#>
[CmdletBinding()]
param([Parameter(Mandatory = $true)][hashtable]$ExpectedSourceHashes)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = 'D:\projects\BetweenUs'
$derivedRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
if (-not $derivedRoot.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath 'D:\proejcts\BetweenUs')) {
    throw 'Canonical workspace guard failed.'
}
Add-Type -AssemblyName System.Drawing

function Assert-PlainPath([string]$LiteralPath, [bool]$Directory) {
    $full = [System.IO.Path]::GetFullPath($LiteralPath)
    if (-not ($full.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($repositoryRoot + '\', [StringComparison]::OrdinalIgnoreCase))) {
        throw 'Path is outside the canonical repository.'
    }
    $entry = Get-Item -LiteralPath $full -Force
    if ($entry.PSIsContainer -ne $Directory) { throw 'Unexpected file or directory type.' }
    $cursor = $full
    while ($cursor.Length -ge $repositoryRoot.Length) {
        $part = Get-Item -LiteralPath $cursor -Force
        if (($part.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse points are refused.' }
        if ($cursor.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) { break }
        $cursor = [System.IO.Path]::GetDirectoryName($cursor)
    }
    return $full
}

function Get-StreamSha256([System.IO.Stream]$Stream) {
    $digest = [System.Security.Cryptography.SHA256]::Create()
    try {
        $Stream.Position = 0
        return [BitConverter]::ToString($digest.ComputeHash($Stream)).Replace('-', '').ToLowerInvariant()
    } finally { $Stream.Position = 0; $digest.Dispose() }
}

function Save-NewPng([System.Drawing.Bitmap]$Bitmap, [string]$Path) {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try { $Bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png); $stream.Flush($true) }
    finally { $stream.Dispose() }
}

$null = Assert-PlainPath $repositoryRoot $true
$null = Assert-PlainPath $PSCommandPath $false
$captureRoot = Join-Path $repositoryRoot 'spec\qa\production\finance-checkpoints-r2'
$null = Assert-PlainPath $captureRoot $true
$comparisonRoot = Join-Path $captureRoot 'comparisons'
$manifestPath = Join-Path $captureRoot 'COMPARISONS.json'
$screens = @(
    [pscustomobject]@{ Input = 'child-home.png'; Output = 'home-side-by-side.png'; Label = 'Child home' },
    [pscustomobject]@{ Input = 'child-finances.png'; Output = 'financial-summary-side-by-side.png'; Label = 'Child finances' },
    [pscustomobject]@{ Input = 'parent-settled-record.png'; Output = 'settled-record-side-by-side.png'; Label = 'Parent settled record' },
    [pscustomobject]@{ Input = 'parent-matching-history.png'; Output = 'matching-history-side-by-side.png'; Label = 'Parent matching history' }
)
$sourceKeys = @($screens | ForEach-Object { 'light/' + $_.Input; 'dark/' + $_.Input })
if ($ExpectedSourceHashes.Count -ne 8) { throw 'Exactly eight approved source hashes are required.' }
foreach ($key in $ExpectedSourceHashes.Keys) {
    if ($sourceKeys -cnotcontains [string]$key -or [string]$ExpectedSourceHashes[$key] -notmatch '^[A-Fa-f0-9]{64}$') { throw 'Invalid source hash key or value.' }
}
if (Test-Path -LiteralPath $comparisonRoot) { $null = Assert-PlainPath $comparisonRoot $true }
foreach ($path in @($manifestPath) + @($screens | ForEach-Object { Join-Path $comparisonRoot $_.Output })) {
    if (Test-Path -LiteralPath $path) { throw 'An output already exists; no files will be overwritten.' }
}

$loaded = @{}
$font = $null
$lightBrush = $null
$darkBrush = $null
$lightHeader = $null
$darkHeader = $null
$outputs = @()
try {
    # Keep all source streams read-only and open until completion, preventing replacement during rendering.
    foreach ($key in $sourceKeys) {
        $path = Join-Path $captureRoot $key.Replace('/', '\')
        $null = Assert-PlainPath $path $false
        $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
        $image = $null
        try {
            if ($stream.Length -lt 8 -or $stream.Length -gt 64MB) { throw 'Unexpected native PNG size.' }
            $hash = Get-StreamSha256 $stream
            if ($hash -cne ([string]$ExpectedSourceHashes[$key]).ToLowerInvariant()) { throw 'Approved source hash mismatch.' }
            $signature = New-Object byte[] 8
            if ($stream.Read($signature, 0, 8) -ne 8) { throw 'Incomplete PNG signature.' }
            $pngSignature = [byte[]]@(137, 80, 78, 71, 13, 10, 26, 10)
            for ($n = 0; $n -lt 8; $n++) { if ($signature[$n] -ne $pngSignature[$n]) { throw 'Source is not a PNG.' } }
            $stream.Position = 0
            $image = [System.Drawing.Image]::FromStream($stream, $false, $true)
            if ($image.RawFormat.Guid -ne [System.Drawing.Imaging.ImageFormat]::Png.Guid -or $image.Width -ne 1080 -or $image.Height -ne 2424) {
                throw 'Native source must be an actual 1080x2424 PNG.'
            }
            $loaded[$key] = [pscustomobject]@{ Path = $path; Hash = $hash; Bytes = $stream.Length; Stream = $stream; Image = $image }
        } catch {
            if ($null -ne $image) { $image.Dispose() }
            $stream.Dispose()
            throw
        }
    }
    $font = [System.Drawing.Font]::new('Segoe UI', 28, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    if (-not $font.FontFamily.Name.Equals('Segoe UI', [StringComparison]::OrdinalIgnoreCase)) { throw 'OS Segoe UI is unavailable.' }
    $lightBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 24, 24, 24))
    $darkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $lightHeader = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 245, 245, 245))
    $darkHeader = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 24, 24, 24))
    if (-not (Test-Path -LiteralPath $comparisonRoot)) { $null = New-Item -ItemType Directory -Path $comparisonRoot }
    $null = Assert-PlainPath $comparisonRoot $true
    foreach ($screen in $screens) {
        $bitmap = [System.Drawing.Bitmap]::new(2160, 2524, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = $null
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.PageUnit = [System.Drawing.GraphicsUnit]::Pixel
            $graphics.Clear([System.Drawing.Color]::White)
            $graphics.FillRectangle($lightHeader, 0, 0, 1080, 100)
            $graphics.FillRectangle($darkHeader, 1080, 0, 1080, 100)
            $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
            $graphics.DrawString('Safe Harbor (light) | ' + $screen.Label, $font, $lightBrush, [System.Drawing.PointF]::new(24, 32))
            $graphics.DrawString('Night Harbor (dark) | ' + $screen.Label, $font, $darkBrush, [System.Drawing.PointF]::new(1104, 32))
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.DrawImageUnscaled($loaded['light/' + $screen.Input].Image, 0, 100)
            $graphics.DrawImageUnscaled($loaded['dark/' + $screen.Input].Image, 1080, 100)
            $output = Join-Path $comparisonRoot $screen.Output
            Save-NewPng $bitmap $output
            $outputs += [pscustomobject]@{ path = 'comparisons/' + $screen.Output; screen = $screen.Label; width = 2160; height = 2524;
                bytes = (Get-Item -LiteralPath $output).Length; sha256 = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant();
                leftSource = 'light/' + $screen.Input; rightSource = 'dark/' + $screen.Input }
        } finally { if ($null -ne $graphics) { $graphics.Dispose() }; $bitmap.Dispose() }
    }
    foreach ($key in $sourceKeys) {
        if ((Get-StreamSha256 $loaded[$key].Stream) -cne $loaded[$key].Hash) { throw 'Source changed during rendering; no completion manifest will be written.' }
    }
    $manifest = [ordered]@{
        format = 1; status = 'complete'; generatedAtUtc = [DateTime]::UtcNow.ToString('o');
        captureRoot = 'spec/qa/production/finance-checkpoints-r2'; helper = 'spec/production/staging/finance-checkpoints/CREATE_COMPARISONS.ps1';
        helperSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant();
        operation = 'System.Drawing DrawImageUnscaled; light left/dark right; no crop, retouch, resizing or upscaling';
        sourceWidth = 1080; sourceHeight = 2424; headerPixels = 100; font = 'OS Segoe UI 28px';
        sourceProvenance = 'Root-approved native capture paths/hashes; this composition does not independently certify capture origin or UI correctness.';
        sources = @($sourceKeys | ForEach-Object { [pscustomobject]@{ path = $_; width = 1080; height = 2424; bytes = $loaded[$_].Bytes; sha256 = $loaded[$_].Hash } });
        outputs = $outputs
    }
    $manifestBytes = [System.Text.UTF8Encoding]::new($false).GetBytes(($manifest | ConvertTo-Json -Depth 10) + "`n")
    $manifestStream = [System.IO.File]::Open($manifestPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try { $manifestStream.Write($manifestBytes, 0, $manifestBytes.Length); $manifestStream.Flush($true) }
    finally { $manifestStream.Dispose() }
    Write-Output 'Created four full-resolution comparison sheets and r2/COMPARISONS.json.'
} finally {
    foreach ($resource in @($font, $lightBrush, $darkBrush, $lightHeader, $darkHeader)) { if ($null -ne $resource) { $resource.Dispose() } }
    foreach ($source in $loaded.Values) { $source.Image.Dispose(); $source.Stream.Dispose() }
}
