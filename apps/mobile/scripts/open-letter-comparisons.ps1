param(
  [string]$Root = (Join-Path $PSScriptRoot '../../../spec/qa/open-letter'),
  [switch]$Replace
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$captureRoot = (Resolve-Path -LiteralPath $Root).Path
$comparisonRoot = Join-Path $captureRoot 'comparisons'
New-Item -ItemType Directory -Path $comparisonRoot -Force | Out-Null

$sheets = @(
  @{ Screen = 'child-home'; Title = 'Child home'; Output = 'home-side-by-side.png' },
  @{ Screen = 'journal-editor'; Title = 'Journal writing'; Output = 'journal-side-by-side.png' },
  @{ Screen = 'active-conversation'; Title = 'Active conversation'; Output = 'conversation-side-by-side.png' },
  @{ Screen = 'my-circle'; Title = 'My Circle and navigation'; Output = 'navigation-overview.png' }
)

# Read original Android captures only. Labels and margins are outside their pixels.
foreach ($sheet in $sheets) {
  $lightPath = Join-Path $captureRoot ('light/' + $sheet.Screen + '.png')
  $darkPath = Join-Path $captureRoot ('dark/' + $sheet.Screen + '.png')
  if (!(Test-Path -LiteralPath $lightPath) -or !(Test-Path -LiteralPath $darkPath)) {
    throw "Missing native captures for $($sheet.Screen). Capture both themes before creating comparisons."
  }
  $outputPath = Join-Path $comparisonRoot $sheet.Output
  if ((Test-Path -LiteralPath $outputPath) -and !$Replace) {
    throw "Comparison already exists: $outputPath. Pass -Replace to regenerate it from current captures."
  }

  $left = $null
  $right = $null
  $canvas = $null
  $graphics = $null
  $titleFont = $null
  $labelFont = $null
  $ink = $null
  try {
    $left = [System.Drawing.Image]::FromFile($lightPath)
    $right = [System.Drawing.Image]::FromFile($darkPath)
    if ($left.Width -ne $right.Width -or $left.Height -ne $right.Height) {
      throw "Theme captures for $($sheet.Screen) have different resolutions. Recapture at identical emulator dimensions."
    }
    $margin = 32
    $header = 150
    $rightX = $margin * 2 + $left.Width
    $canvas = [System.Drawing.Bitmap]::new(
      ($left.Width + $right.Width + $margin * 3),
      ($left.Height + $header + $margin),
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#E8EEF0'))
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $titleFont = [System.Drawing.Font]::new('Segoe UI', 34, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $labelFont = [System.Drawing.Font]::new('Segoe UI', 28, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#253746'))
    $graphics.DrawString(('Between Us - Open Letter / ' + $sheet.Title), $titleFont, $ink, [single]$margin, [single]24)
    $graphics.DrawString('Safe Harbor / light', $labelFont, $ink, [single]$margin, [single]90)
    $graphics.DrawString('Night Harbor / dark', $labelFont, $ink, [single]$rightX, [single]90)
    $graphics.DrawImageUnscaled($left, $margin, $header)
    $graphics.DrawImageUnscaled($right, $rightX, $header)
    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Created $outputPath ($($canvas.Width) x $($canvas.Height)); source viewports retained at $($left.Width) x $($left.Height)."
  } finally {
    foreach ($resource in @($ink, $labelFont, $titleFont, $graphics, $canvas, $right, $left)) {
      if ($null -ne $resource) { $resource.Dispose() }
    }
  }
}
