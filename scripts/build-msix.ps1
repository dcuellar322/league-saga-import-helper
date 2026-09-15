# Run from the repository root on Windows with Node.js and the Windows SDK installed.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'MSIX packaging requires Windows.' }
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$output = Join-Path $root 'apps/desktop/dist-store'
$stage = Join-Path $output 'staging'
New-Item -ItemType Directory -Force $stage | Out-Null
# Validate the real Partner Center identity before doing any expensive packaging.
& node scripts/prepare-msix.mjs $stage
if ($LASTEXITCODE -ne 0) { throw 'Store identity validation failed.' }
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
& npm exec --workspace apps/desktop -- electron-builder --win --x64 --dir --publish never '-c.directories.output=dist-store' '-c.forceCodeSigning=false' '-c.win.signAndEditExecutable=false'
if ($LASTEXITCODE -ne 0) { throw 'Windows packaging failed.' }
$appStage = Join-Path $stage 'app'
if (Test-Path $appStage) { Remove-Item -Recurse -Force $appStage }
Copy-Item -Recurse (Join-Path $output 'win-unpacked') $appStage

# Derive correctly sized Store logos from the existing official app artwork.
Add-Type -AssemblyName System.Drawing
$assets = Join-Path $stage 'Assets'
New-Item -ItemType Directory -Force $assets | Out-Null
$source = [System.Drawing.Image]::FromFile((Join-Path $root 'apps/desktop/assets/league-saga-app-icon.png'))
try {
  foreach ($entry in @{ 'StoreLogo.png' = 50; 'Square150x150Logo.png' = 150; 'Square44x44Logo.png' = 44 }.GetEnumerator()) {
    $bitmap = [System.Drawing.Bitmap]::new($entry.Value, $entry.Value)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.DrawImage($source, 0, 0, $entry.Value, $entry.Value)
      $bitmap.Save((Join-Path $assets $entry.Key), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $source.Dispose() }
$sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
$makeappx = Get-ChildItem "$sdk/*/x64/makeappx.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $makeappx) { throw 'Install the Windows SDK including MakeAppx.exe.' }
$version = (Get-Content apps/desktop/package.json | ConvertFrom-Json).version
$package = Join-Path $output "LeagueSagaImportHelper-$version-store-x64.msix"
& $makeappx.FullName pack /o /d $stage /p $package
if ($LASTEXITCODE -ne 0) { throw 'MakeAppx manifest/package validation failed.' }
$hash = (Get-FileHash $package -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path $package -Leaf)" | Set-Content (Join-Path $output 'SHA256SUMS.txt') -Encoding utf8NoBOM
Write-Output "Store submission package: $package (unsigned; Microsoft signs after certification)"
