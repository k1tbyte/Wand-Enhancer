param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$webPanelDir = Join-Path $repoRoot 'web-panel'
$nativeBuildRoot = Join-Path $repoRoot '.tmp/cmake'
$asarFusesSourceDir = Join-Path $repoRoot 'tools/asar-fuses-bypass'
$asarFusesBuildDir = Join-Path $nativeBuildRoot 'asar-fuses-bypass'
$solutionPath = Join-Path $repoRoot 'Wand-Enhancer.sln'

function Resolve-CommandPath {
    param([string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Required command not found in PATH: $Name"
    }

    return $command.Source
}

function Resolve-NuGetPath {
    $nugetCommand = Get-Command 'nuget.exe' -ErrorAction SilentlyContinue
    if (-not $nugetCommand) {
        $nugetCommand = Get-Command 'nuget' -ErrorAction SilentlyContinue
    }

    if ($nugetCommand) {
        return $nugetCommand.Source
    }

    $toolsDir = Join-Path $repoRoot '.tmp/tools'
    $nugetPath = Join-Path $toolsDir 'nuget.exe'
    if (-not (Test-Path $nugetPath)) {
        New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
        Invoke-WebRequest -Uri 'https://dist.nuget.org/win-x86-commandline/latest/nuget.exe' -OutFile $nugetPath
    }

    return $nugetPath
}

function Resolve-VisualStudio {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path $vswhere)) {
        throw "vswhere.exe not found: $vswhere"
    }

    # No version pin: pick whatever VS the host has (2022/2026/newer) so CI
    # keeps working when the runner image bumps its Visual Studio major.
    $vsArgs = @('-latest', '-prerelease', '-products', '*', '-requires', 'Microsoft.Component.MSBuild')
    $installationPath = & $vswhere @vsArgs -property installationPath
    $installationVersion = & $vswhere @vsArgs -property installationVersion
    $productLine = & $vswhere @vsArgs -property catalog_productLineVersion

    if ([string]::IsNullOrWhiteSpace($installationPath)) {
        throw 'Visual Studio with MSBuild was not found.'
    }

    $msbuildPath = Join-Path $installationPath 'MSBuild\Current\Bin\MSBuild.exe'
    if (-not (Test-Path $msbuildPath)) {
        throw "MSBuild.exe not found: $msbuildPath"
    }

    $major = ($installationVersion -split '\.')[0]
    if ([string]::IsNullOrWhiteSpace($major) -or [string]::IsNullOrWhiteSpace($productLine)) {
        throw "Could not determine the Visual Studio version (version='$installationVersion', line='$productLine')."
    }

    return [pscustomobject]@{
        MSBuild   = $msbuildPath
        Generator = "Visual Studio $major $productLine"
    }
}

function Invoke-Step {
    param(
        [string]$Label,
        [scriptblock]$Action
    )

    Write-Host "==> $Label" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Label"
    }
}

$cmake = Resolve-CommandPath 'cmake'
$nuget = Resolve-NuGetPath
$pnpm = Resolve-CommandPath 'pnpm'
$vs = Resolve-VisualStudio
$msbuild = $vs.MSBuild
$generator = $vs.Generator

Invoke-Step 'Install web-panel dependencies' {
    & $pnpm --dir $webPanelDir install --frozen-lockfile
}

Invoke-Step 'Build web-panel' {
    & $pnpm --dir $webPanelDir run build
}

Invoke-Step 'Configure asar-fuses-bypass' {
    & $cmake -S $asarFusesSourceDir -B $asarFusesBuildDir -G $generator -A x64
}

Invoke-Step 'Build asar-fuses-bypass' {
    & $cmake --build $asarFusesBuildDir --config $Configuration
}

Invoke-Step 'Restore NuGet packages' {
    & $nuget restore $solutionPath -NonInteractive
}

Invoke-Step 'Build solution' {
    & $msbuild $solutionPath /m /p:Configuration=$Configuration '/p:Platform=Any CPU' /t:Build
}

# Code-sign the release executable. A self-signed signature notably lowers
# false-positive AV/VirusTotal detections. The cert is reused across builds and
# generated on first use, so no secrets or env configuration are required.
if ($Configuration -eq 'Release') {
    Write-Host '==> Sign WandEnhancer.exe' -ForegroundColor Cyan

    $exePath = Join-Path $repoRoot "WandEnhancer/bin/$Configuration/WandEnhancer.exe"
    if (-not (Test-Path $exePath)) {
        throw "Executable not found for signing: $exePath"
    }

    $signingSubject = 'CN=Wand-Enhancer'
    $cert = Get-ChildItem Cert:\CurrentUser\My |
        Where-Object { $_.Subject -eq $signingSubject -and $_.HasPrivateKey } |
        Select-Object -First 1
    if (-not $cert) {
        $cert = New-SelfSignedCertificate `
            -Subject $signingSubject `
            -Type CodeSigningCert `
            -CertStoreLocation Cert:\CurrentUser\My `
            -KeyExportPolicy Exportable `
            -KeyUsage DigitalSignature `
            -KeyAlgorithm RSA `
            -KeyLength 2048 `
            -HashAlgorithm SHA256 `
            -NotAfter (Get-Date).AddYears(5)
        Write-Host "Generated self-signed code-signing certificate: $($cert.Subject) [$($cert.Thumbprint)]"
    }

    $signature = Set-AuthenticodeSignature -FilePath $exePath -Certificate $cert -HashAlgorithm SHA256
    if ($signature.Status -ne 'Valid') {
        throw "Signing failed: $($signature.Status) - $($signature.StatusMessage)"
    }

    Write-Host "Signed $exePath [$($cert.Thumbprint)]"
}

Write-Host ''
Write-Host "Build completed successfully ($Configuration)." -ForegroundColor Green