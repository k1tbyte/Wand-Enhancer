param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$webPanelDir = Join-Path $repoRoot 'web-panel'
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

function Resolve-TargetFrameworkRoot {
    # Some environments do not register the v4.8 targeting pack for MSBuild to find on its own.
    # Point at it explicitly when present; skip on CI where default resolution already works.
    $root = Join-Path ${env:ProgramFiles(x86)} 'Reference Assemblies\Microsoft\Framework'
    $frameworkList = Join-Path $root '.NETFramework\v4.8\RedistList\FrameworkList.xml'
    if (Test-Path $frameworkList) {
        return $root
    }

    return $null
}

$pnpm = Resolve-CommandPath 'pnpm'
$visualStudio = Resolve-VisualStudioPath
$msbuild = Resolve-MSBuildPath $visualStudio
$targetFrameworkRoot = Resolve-TargetFrameworkRoot

$buildArgs = @('/m', "/p:Configuration=$Configuration", '/p:Platform=Any CPU')
if ($targetFrameworkRoot) {
    $buildArgs += "/p:TargetFrameworkRootPath=$targetFrameworkRoot"
}

Invoke-Step 'Install web-panel dependencies' {
    & $pnpm --dir $webPanelDir install --frozen-lockfile
}

Invoke-Step 'Lint web-panel' {
    & $pnpm --dir $webPanelDir run lint
}

# Runs type-check (web + bridge), Vite, the bridge bundle, then the dist invariant check.
Invoke-Step 'Build web-panel' {
    & $pnpm --dir $webPanelDir run build
}

Invoke-Step 'Restore NuGet packages' {
    & $msbuild $solutionPath /m /t:Restore /p:RestorePackagesConfig=true
}

Invoke-Step 'Build solution' {
    & $msbuild $solutionPath @buildArgs /t:Build
}

Write-Host ''
Write-Host "Build completed successfully ($Configuration)." -ForegroundColor Green
