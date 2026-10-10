param(
    [Parameter(Mandatory = $true)]
    [string]$ApkPath
)

$ErrorActionPreference = 'Stop'
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$buildTools = Join-Path $sdk 'build-tools\36.1.0'
$aapt = Join-Path $buildTools 'aapt.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'
$zipalign = Join-Path $buildTools 'zipalign.exe'

if (-not (Test-Path $ApkPath)) { throw "APK not found: $ApkPath" }
& $zipalign -c 4 $ApkPath
if ($LASTEXITCODE -ne 0) { throw 'APK alignment verification failed' }
& $apksigner verify --verbose --print-certs $ApkPath
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
$badging = & $aapt dump badging $ApkPath
if ($LASTEXITCODE -ne 0) { throw 'APK metadata inspection failed' }
$expected = "package: name='com.michaelovsky.codexsubscription.isolated' versionCode='12' versionName='2.8.0-tablet.1'"
if (-not ($badging -like "$expected*")) { throw 'Unexpected APK identity or version' }

$manifest = Get-Content (Join-Path $PSScriptRoot 'AndroidManifest.xml') -Raw
foreach ($forbidden in @('BOOT_COMPLETED', 'RuntimeWatchdogService', 'FOREGROUND_SERVICE', 'WAKE_LOCK')) {
    if ($manifest.Contains($forbidden)) { throw "Forbidden persistent component remains: $forbidden" }
}

$server = Get-Content (Join-Path $PSScriptRoot 'vendor\codexapp-frontier-src\src\cli\index.ts') -Raw
if (-not $server.Contains("server.listen(port, '127.0.0.1')")) { throw 'Server is not loopback-only' }

$hash = Get-FileHash -Algorithm SHA256 $ApkPath
"APK_SHA256=$($hash.Hash.ToLowerInvariant())"
'TABLET_BUILD_VERIFIED'
