param(
    [Parameter(Mandatory = $true)]
    [string]$AssemblyPath,
    [string]$BundleDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = Split-Path -Parent $PSScriptRoot
$assembly = [Reflection.Assembly]::LoadFrom((Resolve-Path -LiteralPath $AssemblyPath).Path)
$configType = $assembly.GetType('WandEnhancer.Core.EnhancerConfig', $true)
$cursorType = $assembly.GetType('WandEnhancer.Core.Js.JsCursor', $true)
$applierType = $assembly.GetType('WandEnhancer.Core.JavaScriptPatchApplier', $true)
$canSearchFile = $applierType.GetMethod('CanSearchFile')
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('wand-locators-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)

function Test-Bundles([string]$Name, [IO.FileInfo[]]$Files, [string]$Output) {
    if ($Files.Count -eq 0) { throw "No JavaScript bundles found for $Name" }
    [IO.Directory]::CreateDirectory($Output) | Out-Null
    $sources = @{}
    foreach ($file in $Files) { $sources[$file.Name] = [IO.File]::ReadAllText($file.FullName) }
    $patches = $configType.GetMethod('GetInstance').Invoke($null, @())
    $count = 0

    foreach ($selection in $patches.Values) {
        foreach ($entry in $selection) {
            $applied = $false
            $capability = $false
            foreach ($file in @($sources.Keys)) {
                if (-not $canSearchFile.Invoke($null, @($file, $entry))) { continue }
                $source = $sources[$file]
                foreach ($hint in $entry.CapabilityHints) {
                    if ($source.Contains($hint)) { $capability = $true }
                }
                $hasSearchHint = $false
                foreach ($hint in $entry.SearchHints) {
                    if ($source.Contains($hint)) { $hasSearchHint = $true }
                }
                if (-not $hasSearchHint) { continue }
                $cursor = [Activator]::CreateInstance($cursorType, @($source))
                try {
                    $edits = $entry.Locate.Invoke($cursor)
                }
                catch {
                    throw "$Name / $file / $($entry.Name): $($_.Exception.GetBaseException().Message)"
                }
                if ($null -eq $edits) { continue }
                if ($edits.Length -eq 0) { throw "$($entry.Name) returned no edits" }
                $nextStart = $source.Length
                foreach ($edit in @($edits | Sort-Object Start -Descending)) {
                    if ($edit.Start -lt 0 -or $edit.End -lt $edit.Start -or $edit.End -gt $nextStart) {
                        throw "$($entry.Name) returned overlapping or invalid edits"
                    }
                    $source = $edit.ApplyTo($source)
                    $nextStart = $edit.Start
                }
                $sources[$file] = $source
                $applied = $true
            }
            if (-not $applied -and (-not $entry.IsOptional -or $capability)) {
                throw "$Name did not resolve $($entry.Name)"
            }
            if ($applied) { $count++ }
        }
    }

    foreach ($file in $sources.Keys) {
        $target = Join-Path $Output $file
        [IO.File]::WriteAllText($target, $sources[$file], $utf8)
        & node --check $target
        if ($LASTEXITCODE -ne 0) { throw "$Name produced invalid JavaScript in $file" }
    }
    Write-Host "$Name passed: $count patches, $($sources.Count) parsed bundles."
}

try {
    if ($BundleDirectory) {
        $files = @(Get-ChildItem -LiteralPath $BundleDirectory -Filter '*.js' -File)
        Test-Bundles 'Real bundles' $files (Join-Path $scratch 'patched')
    }
    else {
        $fixture = Join-Path $PSScriptRoot 'tests\patch-locators.js'
        $esbuild = Join-Path $repoRoot 'web-panel\node_modules\esbuild\bin\esbuild'
        foreach ($variant in 'prettified', 'minified') {
            $inputDir = Join-Path $scratch $variant
            [IO.Directory]::CreateDirectory($inputDir) | Out-Null
            $input = Join-Path $inputDir 'index.js'
            $options = @($esbuild, $fixture, '--target=es2022', "--outfile=$input")
            if ($variant -eq 'minified') { $options += '--minify' }
            & node @options
            if ($LASTEXITCODE -ne 0) { throw "Could not generate $variant fixture" }
            Test-Bundles $variant @((Get-Item -LiteralPath $input)) (Join-Path $inputDir 'patched')
        }
    }
}
finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
