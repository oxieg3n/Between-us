param([Parameter(Mandatory=$true)][ValidateSet('mobile','backend')][string]$Scope)

# Read-only npm audit. No fix/install, package scripts, raw registry errors or private configuration are emitted.
$dependencyEvidenceRoot = $PSScriptRoot
$dependencyRepositoryRoot = (Resolve-Path (Join-Path $dependencyEvidenceRoot '../../../../..')).Path
$dependencyPackageRelative = if ($Scope -eq 'mobile') { 'apps/mobile' } else { 'services/backend' }
$dependencyPackageRoot = Join-Path $dependencyRepositoryRoot $dependencyPackageRelative
function Get-DependencyInputHashes {
  $dependencyHashes = [ordered]@{}
  foreach ($dependencyFile in @('package.json','package-lock.json')) {
    $dependencyHashes[$dependencyFile] = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $dependencyPackageRoot $dependencyFile)).Hash.ToLowerInvariant()
  }
  return $dependencyHashes
}
$dependencyBefore = Get-DependencyInputHashes
$dependencyStarted = [DateTime]::UtcNow.ToString('o')
$dependencyAuditExit = $null
$dependencyParsed = $null
Push-Location -LiteralPath $dependencyPackageRoot
try {
  $dependencyAuditText = (& npm audit --json --ignore-scripts 2>$null) -join [Environment]::NewLine
  $dependencyAuditExit = $LASTEXITCODE
  try { $dependencyParsed = $dependencyAuditText | ConvertFrom-Json -ErrorAction Stop } catch { $dependencyParsed = $null }
} finally { Pop-Location }
$dependencyCompleted = [DateTime]::UtcNow.ToString('o')
$dependencyAfter = Get-DependencyInputHashes
$dependencyCounts = [ordered]@{}
$dependencyValidCounts = $true
foreach ($dependencySeverity in @('info','low','moderate','high','critical','total')) {
  $dependencyCount = $dependencyParsed.metadata.vulnerabilities.$dependencySeverity
  if ($null -eq $dependencyCount -or $dependencyCount -isnot [ValueType] -or $dependencyCount -lt 0 -or $dependencyCount -ne [math]::Truncate($dependencyCount)) {
    $dependencyValidCounts = $false; $dependencyCounts[$dependencySeverity] = $null
  } else { $dependencyCounts[$dependencySeverity] = $dependencyCount }
}
$dependencyStatus = if ($dependencyValidCounts -and $dependencyAuditExit -in @(0,1)) { 'completed' } else { 'unavailable' }
$dependencyReport = [ordered]@{
  format = 1
  scope = $dependencyPackageRelative
  command = 'npm audit --json --ignore-scripts'
  startedAt = $dependencyStarted
  completedAt = $dependencyCompleted
  exitCode = $dependencyAuditExit
  status = $dependencyStatus
  vulnerabilities = $dependencyCounts
  dependencyCounts = $dependencyParsed.metadata.dependencies
  beforeSha256 = $dependencyBefore
  afterSha256 = $dependencyAfter
  inputsUnchanged = (($dependencyBefore | ConvertTo-Json -Compress) -ceq ($dependencyAfter | ConvertTo-Json -Compress))
  knownAdvisoryCheckOnly = $true
  installedBytesVerified = $false
  nativeArtifactAudit = $false
  legalApproval = $false
  errorDetailsRetained = $false
}
$dependencyName = $Scope + '-npm-audit-' + [DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.json'
$dependencyOutput = Join-Path $dependencyEvidenceRoot $dependencyName
$dependencyBytes = [Text.Encoding]::UTF8.GetBytes(($dependencyReport | ConvertTo-Json -Depth 8) + [Environment]::NewLine)
$dependencyStream = [IO.File]::Open($dependencyOutput,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try { $dependencyStream.Write($dependencyBytes,0,$dependencyBytes.Length) } finally { $dependencyStream.Dispose() }
[pscustomobject]@{ file=$dependencyName; status=$dependencyStatus; exitCode=$dependencyAuditExit; vulnerabilities=$dependencyCounts; inputsUnchanged=$dependencyReport.inputsUnchanged } | ConvertTo-Json -Depth 4
if ($dependencyStatus -ne 'completed' -or -not $dependencyReport.inputsUnchanged) { exit 2 }
