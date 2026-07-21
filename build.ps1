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

function Resolve-VisualStudioPath {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path $vswhere)) {
        throw "vswhere.exe not found: $vswhere"
    }

    $installationPath = & $vswhere -latest -prerelease -products '*' -requires Microsoft.Component.MSBuild -property installationPath
    if ([string]::IsNullOrWhiteSpace($installationPath)) {
        throw 'Visual Studio with MSBuild was not found.'
    }

    return $installationPath
}

function Resolve-MSBuildPath {
    param([string]$VisualStudioPath)

    $msbuildPath = Join-Path $VisualStudioPath 'MSBuild\Current\Bin\MSBuild.exe'
    if (-not (Test-Path $msbuildPath)) {
        throw "MSBuild.exe not found: $msbuildPath"
    }

    return $msbuildPath
}

function Resolve-DumpBinPath {
    param([string]$VisualStudioPath)

    $versionFile = Join-Path $VisualStudioPath 'VC\Auxiliary\Build\Microsoft.VCToolsVersion.default.txt'
    if (-not (Test-Path $versionFile)) {
        throw "MSVC tools version file not found: $versionFile"
    }

    $toolsVersion = (Get-Content $versionFile -Raw).Trim()
    $dumpBinPath = Join-Path $VisualStudioPath "VC\Tools\MSVC\$toolsVersion\bin\Hostx64\x64\dumpbin.exe"
    if (-not (Test-Path $dumpBinPath)) {
        throw "dumpbin.exe not found: $dumpBinPath"
    }

    return $dumpBinPath
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
$pnpm = Resolve-CommandPath 'pnpm'
$visualStudio = Resolve-VisualStudioPath
$msbuild = Resolve-MSBuildPath $visualStudio
$dumpBin = Resolve-DumpBinPath $visualStudio

Invoke-Step 'Install web-panel dependencies' {
    & $pnpm --dir $webPanelDir install --frozen-lockfile
}

Invoke-Step 'Build web-panel' {
    & $pnpm --dir $webPanelDir run build
}

Invoke-Step 'Configure asar-fuses-bypass' {
    Remove-Item Env:CMAKE_GENERATOR -ErrorAction SilentlyContinue
    & $cmake -S $asarFusesSourceDir -B $asarFusesBuildDir -A x64
}

Invoke-Step 'Build asar-fuses-bypass' {
    & $cmake --build $asarFusesBuildDir --config $Configuration
}

Invoke-Step 'Verify native runtime dependencies' {
    $nativeDll = Join-Path $asarFusesBuildDir "$Configuration\version.dll"
    $dependencies = & $dumpBin /dependents $nativeDll
    if ($dependencies -match '(?im)^\s*(VCRUNTIME|MSVCP|api-ms-win-crt-)[^\s]*\.dll\s*$') {
        throw 'version.dll depends on the dynamic Visual C++ runtime.'
    }
}

Invoke-Step 'Restore NuGet packages' {
    & $msbuild $solutionPath /m /t:Restore /p:RestorePackagesConfig=true
}

Invoke-Step 'Build solution' {
    & $msbuild $solutionPath /m /p:Configuration=$Configuration '/p:Platform=Any CPU' /t:Build
}

Write-Host ''
Write-Host "Build completed successfully ($Configuration)." -ForegroundColor Green
