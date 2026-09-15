# Sign a COPY for disposable Windows VM testing. Never publish this as a release.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Test signing requires Windows.' }
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root 'apps/desktop/dist-store'
$bundle = Join-Path $output 'vm-test'
if (Test-Path $bundle) { throw 'Remove the previous vm-test output before generating a new certificate.' }
$version = (Get-Content (Join-Path $root 'apps/desktop/package.json') | ConvertFrom-Json).version
$original = Join-Path $output "LeagueSagaImportHelper-$version-store-x64.msix"
$originalHash = (Get-FileHash $original -Algorithm SHA256).Hash
[xml]$manifest = Get-Content (Join-Path $output 'staging/AppxManifest.xml')
$publisher = $manifest.Package.Identity.Publisher
$sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
$signTool = Get-ChildItem "$sdk/*/x64/signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signTool) { throw 'Install the Windows SDK including SignTool.exe.' }
New-Item -ItemType Directory $bundle | Out-Null
$package = Join-Path $bundle "LeagueSagaImportHelper-$version-VM-TEST-x64.msix"
Copy-Item $original $package
$cert = $null
$trusted = $null
try {
  $cert = New-SelfSignedCertificate -Type Custom -Subject $publisher -FriendlyName 'LeagueSaga disposable VM test only' -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(90) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
  $certificateFile = Join-Path $bundle 'LeagueSaga-VM-TEST.cer'
  Export-Certificate -Cert $cert -FilePath $certificateFile | Out-Null
  & $signTool.FullName sign /fd SHA256 /sha1 $cert.Thumbprint /s My $package
  if ($LASTEXITCODE -ne 0) { throw 'Test signing failed.' }
  # Temporary trust on the disposable build runner permits full policy verification.
  $trusted = Import-Certificate -FilePath $certificateFile -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople'
  & $signTool.FullName verify /pa /v $package
  if ($LASTEXITCODE -ne 0) { throw 'Signed MSIX verification failed.' }
  if ((Get-FileHash $original -Algorithm SHA256).Hash -ne $originalHash) { throw 'Unsigned Store package changed.' }
  $metadata = [ordered]@{
    purpose = 'Disposable Windows VM testing only; not Microsoft Store certified'
    identity = $manifest.Package.Identity.Name
    publisher = $publisher
    packageVersion = $manifest.Package.Identity.Version
    certificateThumbprint = $cert.Thumbprint
    certificateExpiresUtc = $cert.NotAfter.ToUniversalTime().ToString('o')
    sourceCommit = $env:GITHUB_SHA
    unsignedPackageSha256 = $originalHash.ToLowerInvariant()
  }
  $metadata | ConvertTo-Json | Set-Content (Join-Path $bundle 'TEST-BUILD.json') -Encoding utf8NoBOM
  Copy-Item (Join-Path $root 'docs/WINDOWS_VM_TEST.md') (Join-Path $bundle 'README.md')
  $lines = Get-ChildItem $bundle -File | Sort-Object Name | ForEach-Object { "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $($_.Name)" }
  [IO.File]::WriteAllText((Join-Path $bundle 'SHA256SUMS.txt'), ($lines -join "`n") + "`n")
  Write-Output "VM_TEST_SIGNATURE_OK ($($cert.Thumbprint)); unsigned Store package unchanged."
} finally {
  if ($trusted) { Remove-Item "Cert:\LocalMachine\TrustedPeople\$($trusted.Thumbprint)" }
  if ($cert) { Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -DeleteKey }
}
