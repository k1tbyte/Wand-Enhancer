param(
    [string]$ExpectedVersion
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$assemblyInfoPath = Join-Path $repoRoot 'WandEnhancer\Properties\AssemblyInfo.cs'
$changelogPath = Join-Path $repoRoot 'CHANGELOG.md'

function Normalize-Version {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw 'Version value cannot be empty.'
    }

    return $Value.Trim().TrimStart('v', 'V')
}

function Get-ChangelogSection {
    param(
        [string]$Content,
        [string]$TargetVersion
    )

    $normalizedTargetVersion = Normalize-Version $TargetVersion
    $normalizedContent = $Content -replace "`r`n", "`n" -replace "`r", "`n"
    $lines = $normalizedContent -split "`n"
    $builder = New-Object System.Text.StringBuilder
    $isInsideSection = $false

    foreach ($line in $lines) {
        $match = [regex]::Match($line, '^##\s+\[(?<version>[^\]]+)\]')
        if ($match.Success) {
            if ($isInsideSection) {
                break
            }

            $isInsideSection = (Normalize-Version $match.Groups['version'].Value) -eq $normalizedTargetVersion
            continue
        }

        if (-not $isInsideSection) {
            continue
        }

        [void]$builder.AppendLine($line)
    }

    return $builder.ToString().Trim()
}

if (-not (Test-Path $assemblyInfoPath)) {
    throw "AssemblyInfo.cs not found: $assemblyInfoPath"
}

if (-not (Test-Path $changelogPath)) {
    throw "CHANGELOG.md not found: $changelogPath"
}

$assemblyInfoContent = Get-Content -Path $assemblyInfoPath -Raw
$changelogContent = Get-Content -Path $changelogPath -Raw

$assemblyVersionMatch = [regex]::Match($assemblyInfoContent, '(?m)^\s*\[assembly:\s*AssemblyVersion\("(?<version>[^"]+)"\)\]')
$fileVersionMatch = [regex]::Match($assemblyInfoContent, '(?m)^\s*\[assembly:\s*AssemblyFileVersion\("(?<version>[^"]+)"\)\]')

if (-not $assemblyVersionMatch.Success) {
    throw 'AssemblyVersion was not found in AssemblyInfo.cs.'
}

if (-not $fileVersionMatch.Success) {
    throw 'AssemblyFileVersion was not found in AssemblyInfo.cs.'
}

$assemblyVersion = Normalize-Version $assemblyVersionMatch.Groups['version'].Value
$fileVersion = Normalize-Version $fileVersionMatch.Groups['version'].Value

if ($assemblyVersion -ne $fileVersion) {
    throw "AssemblyVersion ($assemblyVersion) and AssemblyFileVersion ($fileVersion) must match."
}

$changelogVersionMatches = [regex]::Matches($changelogContent, '(?m)^##\s+\[(?<version>[^\]]+)\]')
if ($changelogVersionMatches.Count -eq 0) {
    throw 'CHANGELOG.md must contain at least one version section.'
}

$latestChangelogVersion = Normalize-Version $changelogVersionMatches[0].Groups['version'].Value
if ($latestChangelogVersion -ne $assemblyVersion) {
    throw "The first CHANGELOG.md section ($latestChangelogVersion) must match AssemblyInfo.cs version ($assemblyVersion)."
}

$latestSection = Get-ChangelogSection -Content $changelogContent -TargetVersion $assemblyVersion
if ([string]::IsNullOrWhiteSpace($latestSection)) {
    throw "CHANGELOG.md section '$assemblyVersion' is empty."
}

if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $normalizedExpectedVersion = Normalize-Version $ExpectedVersion
    if ($normalizedExpectedVersion -ne $assemblyVersion) {
        throw "Release tag version ($normalizedExpectedVersion) must match AssemblyInfo.cs version ($assemblyVersion)."
    }

    $expectedSection = Get-ChangelogSection -Content $changelogContent -TargetVersion $normalizedExpectedVersion
    if ([string]::IsNullOrWhiteSpace($expectedSection)) {
        throw "CHANGELOG.md section '$normalizedExpectedVersion' is missing or empty."
    }
}

Write-Host "Validated release metadata for version $assemblyVersion"