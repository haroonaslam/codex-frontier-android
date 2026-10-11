$ErrorActionPreference = 'Stop'

$project = $PSScriptRoot
$branch = (& git -C $project branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') {
    throw "APK builds must run from the main branch; current branch: $branch"
}
$status = (& git -C $project status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $status) {
    throw 'APK builds require a clean worktree'
}
& git -C $project fetch origin 'main:refs/remotes/origin/main'
if ($LASTEXITCODE -ne 0) { throw 'Unable to fetch origin/main before APK build' }
$head = (& git -C $project rev-parse HEAD).Trim()
$originMain = (& git -C $project rev-parse origin/main).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $originMain) {
    throw 'APK builds require local main to match the pushed origin/main revision'
}

$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$platformJar = Join-Path $sdk 'platforms\android-35\android.jar'
$buildTools = Join-Path $sdk 'build-tools\36.1.0'
$aapt = Join-Path $buildTools 'aapt.exe'
$d8 = Join-Path $buildTools 'd8.bat'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (-not (Test-Path $keytool)) {
    $keytool = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot\bin\keytool.exe'
}
$javac = Split-Path $keytool -Parent | Join-Path -ChildPath 'javac.exe'
$jar = Split-Path $keytool -Parent | Join-Path -ChildPath 'jar.exe'

foreach ($required in @($platformJar, $aapt, $d8, $zipalign, $apksigner, $keytool, $javac, $jar)) {
    if (-not (Test-Path $required)) { throw "Missing build dependency: $required" }
}

$build = Join-Path $project 'build\tablet-local'
$dist = Join-Path $project 'dist'
$keystore = Join-Path $build 'codex-frontier-tablet.keystore'
$passwordFile = Join-Path $build 'keystore-password.txt'
$work = Join-Path $build 'compile'
$output = Join-Path $dist 'Codex-Frontier-2.8.0-tablet.1.apk'

New-Item -ItemType Directory -Force -Path $build, $dist | Out-Null
if (-not (Test-Path $passwordFile)) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    [Convert]::ToBase64String($bytes) | Set-Content -NoNewline -Encoding ascii $passwordFile
}
$password = (Get-Content $passwordFile -Raw).Trim()
if (-not (Test-Path $keystore)) {
    & $keytool -genkeypair -keystore $keystore -storepass $password -keypass $password -alias codex-frontier-tablet -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Codex Frontier Tablet, OU=Personal Android Client, O=Local Build, C=AU'
    if ($LASTEXITCODE -ne 0) { throw 'Keystore generation failed' }
}

if (Test-Path $work) { Remove-Item -LiteralPath $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $work 'gen'), (Join-Path $work 'classes'), (Join-Path $work 'dex') | Out-Null

& $aapt package -f -m -J (Join-Path $work 'gen') -M (Join-Path $project 'AndroidManifest.xml') -S (Join-Path $project 'res') -I $platformJar
if ($LASTEXITCODE -ne 0) { throw 'aapt resource generation failed' }

$javaFiles = @(
    Get-ChildItem (Join-Path $project 'src') -Recurse -Filter '*.java' | ForEach-Object FullName
    Get-ChildItem (Join-Path $work 'gen') -Recurse -Filter '*.java' | ForEach-Object FullName
)
& $javac -source 8 -target 8 -classpath $platformJar -d (Join-Path $work 'classes') @javaFiles
if ($LASTEXITCODE -ne 0) { throw 'Java compilation failed' }

$classesJar = Join-Path $work 'classes.jar'
& $jar cf $classesJar -C (Join-Path $work 'classes') .
if ($LASTEXITCODE -ne 0) { throw 'Class archive creation failed' }
& $d8 --lib $platformJar --min-api 30 --output (Join-Path $work 'dex') $classesJar
if ($LASTEXITCODE -ne 0) { throw 'DEX compilation failed' }

$unsigned = Join-Path $work 'unsigned.apk'
$aligned = Join-Path $work 'aligned.apk'
& $aapt package -f -M (Join-Path $project 'AndroidManifest.xml') -S (Join-Path $project 'res') -I $platformJar -F $unsigned
if ($LASTEXITCODE -ne 0) { throw 'APK packaging failed' }
& $jar uf $unsigned -C (Join-Path $work 'dex') classes.dex
if ($LASTEXITCODE -ne 0) { throw 'DEX insertion failed' }
& $zipalign -f 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed' }
& $apksigner sign --ks $keystore --ks-key-alias codex-frontier-tablet --ks-pass "file:$passwordFile" --out $output $aligned
if ($LASTEXITCODE -ne 0) { throw 'APK signing failed' }

& (Join-Path $project 'verify-tablet-build.ps1') -ApkPath $output
