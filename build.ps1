param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',
    [switch]$EnableUpdateNotifications
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
    # Some local targeting packs are installed but not registered with MSBuild.
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
if ($EnableUpdateNotifications) {
    $buildArgs += '/p:EnableUpdateNotifications=true'
}

Invoke-Step 'Install web-panel dependencies' {
    & $pnpm --dir $webPanelDir install --frozen-lockfile
}

Invoke-Step 'Lint web-panel' {
    & $pnpm --dir $webPanelDir run lint
}

Invoke-Step 'Build web-panel' {
    & $pnpm --dir $webPanelDir run build
}

Invoke-Step 'Test web-panel' {
    # Node 22+ ships its own experimental `localStorage`/`sessionStorage` globals, and without a
    # configured backing file they're non-functional (e.g. `localStorage.clear is not a
    # function`). Vitest's jsdom environment defers to them when present instead of using jsdom's
    # own working storage, and that can only be disabled via a Node startup flag - not from
    # vitest.config.ts, since the globals are already bound by the time any config code runs.
    $previousNodeOptions = $env:NODE_OPTIONS
    $env:NODE_OPTIONS = "$previousNodeOptions --no-experimental-webstorage".Trim()
    try {
        & $pnpm --dir $webPanelDir exec vitest run
    }
    finally {
        $env:NODE_OPTIONS = $previousNodeOptions
    }
}

Invoke-Step 'Restore NuGet packages' {
    & $msbuild $solutionPath /m /t:Restore /p:RestorePackagesConfig=true
}

Invoke-Step 'Build solution' {
    & $msbuild $solutionPath @buildArgs /t:Build
}

$assemblyPath = Join-Path $repoRoot "WandEnhancer\bin\$Configuration\WandEnhancer.exe"
Invoke-Step 'Test desktop patch state and interop' {
    & (Join-Path $repoRoot 'scripts\test-desktop.ps1') `
        -AssemblyPath $assemblyPath `
        -ExpectUpdateNotifications:$EnableUpdateNotifications
}

Invoke-Step 'Test structural patch locators' {
    & (Join-Path $repoRoot 'scripts\test-patch-locators.ps1') -AssemblyPath $assemblyPath
}

Write-Host ''
Write-Host "Build completed successfully ($Configuration)." -ForegroundColor Green
