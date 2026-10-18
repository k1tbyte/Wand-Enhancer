param(
    [string]$AssemblyPath,
    [string]$AuxiliaryPath,
    [string]$ClientExecutable
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = Split-Path -Parent $PSScriptRoot
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('wand-aux-test-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message (expected $Expected, got $Actual)" }
}

function New-Fixture([string]$Path, [string]$Options) {
    $source = Join-Path $PSScriptRoot 'tests/auxiliary-integrity.cs'
    if ($PSVersionTable.PSVersion.Major -ge 6) {
        Add-Type -Path $source -OutputAssembly $Path -CompilerOptions $Options
    }
    else {
        $parameters = New-Object System.CodeDom.Compiler.CompilerParameters
        $parameters.CompilerOptions = $Options
        $parameters.OutputAssembly = $Path
        $parameters.GenerateInMemory = $false
        $parameters.ReferencedAssemblies.Add('System.dll') | Out-Null
        $provider = New-Object Microsoft.CSharp.CSharpCodeProvider
        try {
            $result = $provider.CompileAssemblyFromFile($parameters, $source)
            if ($result.Errors.HasErrors) { throw ($result.Errors | Out-String) }
        }
        finally { $provider.Dispose() }
    }
}

try {
    if ($AssemblyPath) {
        $assembly = [Reflection.Assembly]::LoadFrom((Resolve-Path -LiteralPath $AssemblyPath).Path)
    }
    else {
        # Isolated source checks also run without Visual Studio or a WPF build.
        $sourceAssembly = Join-Path $scratch 'patcher.dll'
        Add-Type -Path @(
            (Join-Path $repoRoot 'WandEnhancer/Core/ELogType.cs'),
            (Join-Path $repoRoot 'WandEnhancer/Core/Patching/Strategies/Static/DotNetImage.cs'),
            (Join-Path $repoRoot 'WandEnhancer/Core/Patching/Strategies/Static/AuxTrustNeutralizer.cs')
        ) -OutputAssembly $sourceAssembly
        $assembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($sourceAssembly))
    }
    $neutralizer = $assembly.GetType('WandEnhancer.Core.Patching.Strategies.Static.AuxTrustNeutralizer', $true)
    $neutralize = $neutralizer.GetMethod('Neutralize')

    foreach ($variant in 'current', 'legacy') {
        $fixture = Join-Path $scratch "$variant.dll"
        $options = if ($variant -eq 'legacy') { '/define:LEGACY' } else { '/optimize+' }
        New-Fixture $fixture $options
        $arguments = [object[]]@([string]$fixture, $null)
        if ($neutralize.GetParameters().Length -eq 3) { $arguments += $true }
        $changed = $neutralize.Invoke($null, $arguments)
        $expected = if ($variant -eq 'current') { 3 } else { 1 }
        Assert-Equal $changed $expected "$variant signature and ASAR patch count"

        # Loading bytes avoids locking fixture files, and executes the actual
        # patched IL so invalid exception-handler/header edits cannot pass.
        $patched = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($fixture))
        $type = $patched.GetType('AuxiliaryFixture', $true)
        Assert-Equal ($type.GetMethod('SignatureCheck').Invoke($null, $null)) 0 "$variant signature status"
        if ($variant -eq 'current') {
            $result = $type.GetMethod('AsarCheck').Invoke($null, [object[]]@('missing-client'))
            Assert-Equal ([int]$result) 0 'Patched ASAR validation status'
            $result = $type.GetMethod('FuseCheck').Invoke($null, [object[]]@($null, 'missing-client', $null))
            Assert-Equal ([int]$result) 0 'Patched disk/memory fuse validation status'
        }
        Assert-Equal ($type.GetMethod('UnrelatedPath').Invoke($null, $null)) 'resources\app.asar' 'Unrelated path method preserved'
        Assert-Equal ($type.GetMethod('UnrelatedAlgorithm').Invoke($null, $null)) 'SHA256' 'Unrelated algorithm method preserved'
        $hash = (Get-FileHash -LiteralPath $fixture).Hash
        Assert-Equal ($neutralize.Invoke($null, $arguments)) 0 "$variant idempotence"
        Assert-Equal (Get-FileHash -LiteralPath $fixture).Hash $hash "$variant second pass leaves bytes unchanged"
    }

    # Supervised leaves the executable's Authenticode check intact.
    $supervised = Join-Path $scratch 'supervised.dll'
    New-Fixture $supervised '/optimize+'
    Assert-Equal ($neutralize.Invoke($null, [object[]]@([string]$supervised, $null, $false))) 2 'Supervised archive and fuse patch count'
    $patched = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($supervised))
    $type = $patched.GetType('AuxiliaryFixture', $true)
    Assert-Equal ([int]$type.GetMethod('AsarCheck').Invoke($null, [object[]]@('missing-client'))) 0 'Supervised ASAR validation status'
    Assert-Equal ([int]$type.GetMethod('FuseCheck').Invoke($null, [object[]]@($null, 'missing-client', $null))) 0 'Supervised fuse validation status'
    $signatureIl = $type.GetMethod('SignatureCheck').GetMethodBody().GetILAsByteArray()
    Assert-Equal ($signatureIl[0] -eq 0x16 -and $signatureIl[1] -eq 0x2A) $false 'Supervised signature check preserved'

    $unsupported = Join-Path $scratch 'unsupported.dll'
    New-Fixture $unsupported '/define:UNSUPPORTED'
    $originalHash = (Get-FileHash -LiteralPath $unsupported).Hash
    $rejected = $false
    try { $neutralize.Invoke($null, [object[]]@([string]$unsupported, $null, $true)) | Out-Null }
    catch { $rejected = $_.Exception.GetBaseException().Message -eq 'Unrecognised auxiliary ASAR validation signature.' }
    Assert-Equal $rejected $true 'Unsupported ASAR shape fails loudly'
    Assert-Equal (Get-FileHash -LiteralPath $unsupported).Hash $originalHash 'Unsupported service is not partially patched'

    $restructured = Join-Path $scratch 'restructured.dll'
    New-Fixture $restructured '/define:RESTRUCTURED'
    $originalHash = (Get-FileHash -LiteralPath $restructured).Hash
    $rejected = $false
    try { $neutralize.Invoke($null, [object[]]@([string]$restructured, $null, $false)) | Out-Null }
    catch { $rejected = $_.Exception.GetBaseException().Message -eq 'Auxiliary ASAR validation detected but not recognised.' }
    Assert-Equal $rejected $true 'Detected but restructured ASAR validation fails loudly'
    Assert-Equal (Get-FileHash -LiteralPath $restructured).Hash $originalHash 'Restructured service is unchanged'

    if ($AuxiliaryPath) {
        $realCopy = Join-Path $scratch 'real-auxiliary.exe'
        Copy-Item -LiteralPath $AuxiliaryPath -Destination $realCopy
        Assert-Equal ($neutralize.Invoke($null, [object[]]@([string]$realCopy, $null, $false))) 2 'Real auxiliary archive and fuse patch count'
        Assert-Equal ($neutralize.Invoke($null, [object[]]@([string]$realCopy, $null, $false))) 0 'Real auxiliary ASAR idempotence'
        # Full client-gate checks below also need the signature adjustment when
        # the supplied client uses Static and has a changed on-disk fuse.
        $neutralize.Invoke($null, [object[]]@([string]$realCopy, $null, $true)) | Out-Null
        $realAssembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($realCopy))
        try { $realTypes = $realAssembly.GetTypes() }
        catch [Reflection.ReflectionTypeLoadException] { $realTypes = $_.Exception.Types | Where-Object { $null -ne $_ } }
        $realValidators = @($realTypes | ForEach-Object {
            $_.GetMethods([Reflection.BindingFlags]'Public,NonPublic,Static,DeclaredOnly')
        } | Where-Object {
            $parameters = $_.GetParameters()
            $isArchive = $parameters.Length -eq 1 -and $parameters[0].ParameterType -eq [string]
            $isFuse = $parameters.Length -eq 3 -and $parameters[1].ParameterType -eq [string]
            if (-not $_.ReturnType.IsEnum -or (-not $isArchive -and -not $isFuse)) { return $false }
            $il = $_.GetMethodBody().GetILAsByteArray()
            return $il.Length -ge 2 -and $il[0] -eq 0x16 -and $il[1] -eq 0x2A
        })
        Assert-Equal $realValidators.Count 2 'Real auxiliary has archive and fuse validators patched'
        foreach ($validator in $realValidators) {
            $arguments = if ($validator.GetParameters().Length -eq 1) { [object[]]@('missing-client') } else { [object[]]@($null, 'missing-client', $null) }
            Assert-Equal ([int]$validator.Invoke($null, $arguments)) 0 'Real auxiliary patched validator executes'
        }
        if ($ClientExecutable) {
            $methods = @($realTypes | ForEach-Object { $_.GetMethods([Reflection.BindingFlags]'Public,NonPublic,Static,DeclaredOnly') })
            $gates = @($methods | Where-Object {
                $p = $_.GetParameters()
                return $_.ReturnType -eq [bool] -and $p.Length -eq 3 -and $p[1].ParameterType -eq [string] -and
                    $p[0].ParameterType.IsClass -and -not $p[0].ParameterType.Namespace -and
                    $p[2].ParameterType.IsClass -and -not $p[2].ParameterType.Namespace
            })
            Assert-Equal $gates.Count 1 'Real auxiliary combined client gate located'
            $verifiedType = $gates[0].GetParameters()[0].ParameterType
            $verifiers = @($methods | Where-Object {
                $p = $_.GetParameters()
                return $_.ReturnType -eq $verifiedType -and $p.Length -eq 1 -and $p[0].ParameterType -eq [string]
            })
            Assert-Equal $verifiers.Count 1 'Real auxiliary signed-file verifier located'
            $verified = $verifiers[0].Invoke($null, [object[]]@([string]$ClientExecutable))
            try {
                # Both patched status methods were executed above. The wrapper
                # stays non-null, but cannot trigger process reads through their
                # early returns. A null wrapper would skip the old fuse check and
                # incorrectly make an archive-only patch appear sufficient.
                $processType = $gates[0].GetParameters()[2].ParameterType
                $process = [Runtime.Serialization.FormatterServices]::GetUninitializedObject($processType)
                Assert-Equal ($gates[0].Invoke($null, [object[]]@($verified, [string]$ClientExecutable, $process))) $true 'Real combined client gate accepts patched executable'
            }
            finally { $verified.Dispose() }
        }
    }
    Write-Host 'Auxiliary regression checks passed (current, legacy, supervised, executable IL, idempotence).'
}
finally {
    if (([IO.Path]::GetFullPath($scratch)).StartsWith(([IO.Path]::GetFullPath([IO.Path]::GetTempPath())), [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $scratch -Recurse -Force
    }
}
