<#
.SYNOPSIS
    Compiles anics-ffi and copies native binaries to android-native/app/src/main/jniLibs.
.DESCRIPTION
    Supports cross-compiling for Android (aarch64-linux-android, x86_64-linux-android) using cargo-ndk
    or building the host platform library for desktop testing.
#>
param(
    [ValidateSet("aarch64", "x86_64", "host", "all")]
    [string]$Target = "all",
    [ValidateSet("release", "debug")]
    [string]$Configuration = "release"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path "$ScriptDir\..\.."
$FfiDir = "$RootDir\crates\anics-ffi"
$JniLibsDir = "$RootDir\android-native\app\src\main\jniLibs"

Write-Host "=== AniCS Native FFI Builder ===" -ForegroundColor Cyan
Write-Host "FFI Crate: $FfiDir"
Write-Host "Output JNI: $JniLibsDir"

$IsRelease = ($Configuration -eq "release")
$TargetDir = "$FfiDir\target"

function Build-AndroidAbi {
    param(
        [string]$Triple,
        [string]$Abi
    )

    Write-Host "`n--> Building $Abi ($Triple)..." -ForegroundColor Yellow
    $DestDir = "$JniLibsDir\$Abi"
    if (!(Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    # Verify if cargo-ndk is installed
    $hasCargoNdk = Get-Command "cargo-ndk" -ErrorAction SilentlyContinue
    if ($hasCargoNdk) {
        $cargoArguments = @("ndk", "--target", $Triple, "--platform", "26", "build")
        if ($IsRelease) { $cargoArguments += "--release" }
        Push-Location $FfiDir
        try {
            & cargo @cargoArguments
            if ($LASTEXITCODE -ne 0) { throw "Android build failed for ${Triple}" }
            $Subfolder = if ($IsRelease) { "release" } else { "debug" }
            $SrcSo = "$TargetDir\$Triple\$Subfolder\libanics_ffi.so"
            if (Test-Path $SrcSo) {
                Copy-Item $SrcSo -Destination "$DestDir\libanics_ffi.so" -Force
                Write-Host "Copied: $SrcSo -> $DestDir\libanics_ffi.so" -ForegroundColor Green
            } else {
                throw "Could not find compiled .so at $SrcSo"
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Warning "cargo-ndk is not installed in current environment. Using standard cargo build --target $Triple"
        Push-Location $FfiDir
        try {
            $cargoArguments = @("build", "--target", $Triple)
            if ($IsRelease) { $cargoArguments += "--release" }
            & cargo @cargoArguments
            if ($LASTEXITCODE -ne 0) { throw "Android build failed for ${Triple}" }
            $Subfolder = if ($IsRelease) { "release" } else { "debug" }
            $SrcSo = "$TargetDir\$Triple\$Subfolder\libanics_ffi.so"
            if (Test-Path $SrcSo) {
                Copy-Item $SrcSo -Destination "$DestDir\libanics_ffi.so" -Force
                Write-Host "Copied: $SrcSo -> $DestDir\libanics_ffi.so" -ForegroundColor Green
            } else {
                throw "Could not find compiled .so at $SrcSo"
            }
        } finally {
            Pop-Location
        }
    }
}

if ($Target -eq "host" -or $Target -eq "all") {
    Write-Host "`n--> Building host target..." -ForegroundColor Yellow
    Push-Location $FfiDir
    try {
        if ($IsRelease) {
            cargo build --release
        } else {
            cargo build
        }
        if ($LASTEXITCODE -ne 0) { throw "Host library build failed" }
        Write-Host "Host library build succeeded." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

if ($Target -eq "aarch64" -or $Target -eq "all") {
    Build-AndroidAbi -Triple "aarch64-linux-android" -Abi "arm64-v8a"
}

if ($Target -eq "x86_64" -or $Target -eq "all") {
    Build-AndroidAbi -Triple "x86_64-linux-android" -Abi "x86_64"
}

Write-Host "`n[OK] FFI build step completed." -ForegroundColor Green
