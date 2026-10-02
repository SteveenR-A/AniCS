[CmdletBinding()]
param(
    # Applies only to the current PowerShell process; no machine/user settings change.
    [switch]$ConfigureSession,
    [switch]$RequireAndroid
)

$ErrorActionPreference = 'Stop'

function Find-Executable([string]$Name) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($command) { return $command.Source }
    return $null
}

$javaHomePath = $null
if ($env:JAVA_HOME -and (Test-Path -LiteralPath "$env:JAVA_HOME/bin/javac.exe")) {
    $javaHomePath = $env:JAVA_HOME
} else {
    $javacPath = Find-Executable 'javac.exe'
    if ($javacPath) {
        $javaHomePath = Split-Path (Split-Path $javacPath -Parent) -Parent
    } else {
        $jdkRoots = @(
            "$env:ProgramFiles/Microsoft",
            "$env:ProgramFiles/Java",
            "$env:ProgramFiles/Eclipse Adoptium"
        )
        $jdkCandidates = foreach ($root in $jdkRoots) {
            if (Test-Path -LiteralPath $root) {
                Get-ChildItem -LiteralPath $root -Directory |
                    Where-Object { Test-Path -LiteralPath "$($_.FullName)/bin/javac.exe" }
            }
        }
        $jdk = $jdkCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($jdk) { $javaHomePath = $jdk.FullName }
    }
}

$coreutilsPath = Find-Executable 'cat.exe'
if (-not $coreutilsPath) {
    $gitPath = Find-Executable 'git.exe'
    if ($gitPath) {
        $gitRoot = Split-Path (Split-Path $gitPath -Parent) -Parent
        $candidate = Join-Path $gitRoot 'usr/bin/cat.exe'
        if (Test-Path -LiteralPath $candidate) { $coreutilsPath = $candidate }
    }
}

$sdkPath = $null
$sdkCandidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    "$env:LOCALAPPDATA/Android/Sdk",
    'C:/Android/Sdk'
)
foreach ($candidate in $sdkCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate) -and (
        (Test-Path -LiteralPath "$candidate/platforms") -or
        (Test-Path -LiteralPath "$candidate/cmdline-tools")
    )) {
        $sdkPath = $candidate
        break
    }
}

if ($ConfigureSession) {
    if ($javaHomePath) {
        $env:JAVA_HOME = $javaHomePath
        $env:PATH = "$javaHomePath\bin;" + $env:PATH
    }
    if ($coreutilsPath) {
        $env:PATH = (Split-Path $coreutilsPath -Parent) + ';' + $env:PATH
    }
    if ($sdkPath) { $env:ANDROID_HOME = $sdkPath }
}

$ndkVersions = @()
if ($sdkPath -and (Test-Path -LiteralPath "$sdkPath/ndk")) {
    $ndkVersions = @(Get-ChildItem -LiteralPath "$sdkPath/ndk" -Directory |
        Select-Object -ExpandProperty Name)
}

[pscustomobject]@{
    JavaHome = $javaHomePath
    Kotlin = Find-Executable 'kotlinc.cmd'
    Coreutils = $coreutilsPath
    AndroidSdk = $sdkPath
    NdkVersions = $ndkVersions
    Adb = if ($sdkPath -and (Test-Path -LiteralPath "$sdkPath/platform-tools/adb.exe")) {
        "$sdkPath/platform-tools/adb.exe"
    } else { Find-Executable 'adb.exe' }
    CargoNdk = Find-Executable 'cargo-ndk.exe'
    NativeGradleWrapper = Test-Path -LiteralPath "$PSScriptRoot/../../android-native/gradlew.bat"
    SessionConfigured = $ConfigureSession.IsPresent
}

if ($RequireAndroid -and (-not $javaHomePath -or -not $sdkPath -or $ndkVersions.Count -eq 0)) {
    throw 'Android build prerequisites are incomplete: a JDK, Android SDK and side-by-side NDK are required. See docs/android-native/validation.md.'
}
