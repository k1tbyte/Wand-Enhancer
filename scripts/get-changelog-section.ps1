param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
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

if (-not (Test-Path $changelogPath)) {
    throw "CHANGELOG.md not found: $changelogPath"
}

$changelogContent = Get-Content -Path $changelogPath -Raw
$section = Get-ChangelogSection -Content $changelogContent -TargetVersion $Version

if ([string]::IsNullOrWhiteSpace($section)) {
    throw "Changelog section for version '$(Normalize-Version $Version)' was not found in CHANGELOG.md."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    Write-Output $section
    exit 0
}

$resolvedOutputPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
}
else {
    Join-Path $repoRoot $OutputPath
}

Set-Content -Path $resolvedOutputPath -Value $section -Encoding utf8
Write-Host "Wrote changelog section to $resolvedOutputPath"