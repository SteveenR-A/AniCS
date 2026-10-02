[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
& "$PSScriptRoot/check-environment.ps1" -ConfigureSession | Out-Null
if (-not (Get-Command java.exe -ErrorAction SilentlyContinue) -or
    -not (Get-Command kotlinc -ErrorAction SilentlyContinue) -or
    -not (Get-Command cat.exe -ErrorAction SilentlyContinue)) {
    throw 'The JVM contract check requires Java, Kotlin and coreutils.'
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$fixturePath = Join-Path $repoRoot 'docs/android-native/fixtures/crypto-v1.json'
$fixture = [System.IO.File]::ReadAllText($fixturePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
if ($null -eq $fixture) { throw 'Could not read the crypto fixture.' }
if ($fixture.fixtureVersion -ne 1 -or $fixture.iterations -ne 100000 -or
    $fixture.keyBits -ne 256 -or $fixture.tagBits -ne 128 -or $fixture.hash -ne 'SHA-256') {
    throw 'The fixture parameters are not supported by this verifier.'
}

$outputDir = Join-Path $repoRoot 'src-tauri/target/native-contracts'
& mkdir.exe -p $outputDir
if ($LASTEXITCODE -ne 0) { throw 'Could not create the ignored JVM build directory.' }
$jarPath = Join-Path $outputDir 'sync-crypto-contract.jar'
& kotlinc "$PSScriptRoot/SyncCryptoContract.kt" -include-runtime -d $jarPath
if ($LASTEXITCODE -ne 0) { throw 'Kotlin contract compilation failed.' }

$fixtureArguments = @(
    $fixture.pin, $fixture.wrongPin, $fixture.saltBase64, $fixture.ivBase64,
    [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($fixture.plaintext)),
    $fixture.ciphertextBase64, $fixture.plaintextSha256
)
& java.exe -jar $jarPath @fixtureArguments
if ($LASTEXITCODE -ne 0) { throw 'Kotlin/JDK crypto compatibility failed.' }
