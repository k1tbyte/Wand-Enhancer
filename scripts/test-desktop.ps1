param(
    [Parameter(Mandatory = $true)]
    [string]$AssemblyPath,
    [switch]$ExpectUpdateNotifications
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$assembly = [Reflection.Assembly]::LoadFrom((Resolve-Path -LiteralPath $AssemblyPath).Path)
$privateStatic = [Reflection.BindingFlags]'NonPublic, Static'
$privateInstance = [Reflection.BindingFlags]'NonPublic, Instance'

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message (expected $Expected, got $Actual)" }
}

$supervisedNamespace = 'WandEnhancer.Core.Patching.Strategies.Supervised'
foreach ($typeName in 'MemoryFuseApplicator', 'ProcessInfo') {
    $type = $assembly.GetType("$supervisedNamespace.$typeName", $true)
    $methods = @($type.GetMethods($privateStatic) | Where-Object { $_.Name -in 'ReadProcessMemory', 'WriteProcessMemory' })
    $expectedMethodCount = if ($typeName -eq 'MemoryFuseApplicator') { 2 } else { 1 }
    Assert-Equal $methods.Count $expectedMethodCount "$typeName native memory methods"
    foreach ($method in $methods) {
        $parameters = $method.GetParameters()
        Assert-Equal $parameters[3].ParameterType ([UIntPtr]) "$typeName.$($method.Name) size"
        Assert-Equal $parameters[4].ParameterType ([UIntPtr].MakeByRefType()) "$typeName.$($method.Name) byte count"
    }
}

$updateNotifier = $assembly.GetType('WandEnhancer.Core.UpdateNotifier', $false)
Assert-Equal ($null -ne $updateNotifier) ([bool]$ExpectUpdateNotifications) 'Compile-time update notifier'
if ($ExpectUpdateNotifications) {
    $isNewerVersion = $updateNotifier.GetMethod('IsNewerVersion', $privateStatic)
    $current = $assembly.GetName().Version
    $newer = [Version]::new($current.Major, $current.Minor, $current.Build, $current.Revision + 1)
    Assert-Equal ($isNewerVersion.Invoke($null, @($newer.ToString()))) $true 'Newer release detection'
    Assert-Equal ($isNewerVersion.Invoke($null, @("v$current"))) $false 'Current release detection'
    Assert-Equal ($isNewerVersion.Invoke($null, @('invalid'))) $false 'Invalid release detection'

    $buildNotificationText = $updateNotifier.GetMethod('BuildNotificationText', $privateStatic)
    $notificationText = $buildNotificationText.Invoke($null, @("### Fixes`n- Fixed launch"))
    Assert-Equal ($notificationText.Contains('Fixed launch')) $true 'Release note notification'

    $appSettings = [Activator]::CreateInstance($assembly.GetType('WandEnhancer.Core.Services.AppSettings', $true))
    Assert-Equal $appSettings.CheckUpdates $true 'Update check default enabled'
    Assert-Equal $appSettings.CheckPrereleases $false 'Prerelease check default disabled'

    $vmType = $assembly.GetType('WandEnhancer.View.MainWindow.MainWindowVm', $true)
    Assert-Equal ($null -ne $vmType.GetProperty('IsUpdateAvailable')) $true 'Header update badge property'
    Assert-Equal ($null -ne $vmType.GetProperty('ShowUpdateCommand')) $true 'Header update badge command'
}

$scratch = Join-Path ([IO.Path]::GetTempPath()) ('wand-desktop-test-' + [guid]::NewGuid().ToString('N'))
$install = Join-Path $scratch 'app-1.0.0'
$resources = Join-Path $install 'resources'
[IO.Directory]::CreateDirectory($resources) | Out-Null

try {
    $enhancerType = $assembly.GetType('WandEnhancer.Core.Enhancer', $true)
    $isPatched = $enhancerType.GetMethod('IsPatched')
    $hasBackup = $enhancerType.GetMethod('HasBackup')
    $backup = Join-Path $resources 'app.asar.backup'
    $unpackedBackup = Join-Path $resources 'app.asar.unpacked.backup'
    $markerName = $enhancerType.GetField('IncompletePatchMarkerFileName', $privateStatic).GetRawConstantValue()
    $marker = Join-Path $resources $markerName
    $asar = Join-Path $resources 'app.asar'
    $unpacked = Join-Path $resources 'app.asar.unpacked'

    $installArgument = [object[]]@([string]$install)
    Assert-Equal ($isPatched.Invoke($null, $installArgument)) $false 'Fresh installation'
    [IO.File]::WriteAllText($backup, 'original archive')
    Assert-Equal ($isPatched.Invoke($null, $installArgument)) $false 'Incomplete backup'
    [IO.Directory]::CreateDirectory($unpackedBackup) | Out-Null
    [IO.File]::WriteAllText((Join-Path $unpackedBackup 'original.txt'), 'original unpacked')
    Assert-Equal ($hasBackup.Invoke($null, $installArgument)) $true 'Complete backup'
    Assert-Equal ($isPatched.Invoke($null, $installArgument)) $true 'Legacy complete backups'
    [IO.File]::WriteAllText($marker, '')
    Assert-Equal ($hasBackup.Invoke($null, $installArgument)) $true 'Restorable unfinished patch'
    Assert-Equal ($isPatched.Invoke($null, $installArgument)) $false 'Unfinished patch'

    $config = [Activator]::CreateInstance($assembly.GetType('WandEnhancer.Models.WeModConfig', $true))
    $config.RootDirectory = $install
    $config.ExecutableName = 'FixtureClient.exe'
    $config.BrandName = 'wand-test-' + [guid]::NewGuid().ToString('N')
    $logType = $assembly.GetType('WandEnhancer.Core.ELogType', $true)
    $loggerType = [Action``2].MakeGenericType([string], $logType)
    $logger = { param($message, $level) } -as $loggerType
    $enhancer = [Activator]::CreateInstance($enhancerType, @($config, $logger))
    $rollback = $enhancerType.GetMethod('RollbackQuietly', $privateInstance)

    [IO.File]::WriteAllText($asar, 'partial archive')
    [IO.Directory]::CreateDirectory($unpacked) | Out-Null
    [IO.File]::WriteAllText((Join-Path $unpacked 'injected.txt'), 'partial injection')
    $rollback.Invoke($enhancer, $null) | Out-Null
    Assert-Equal ([IO.File]::ReadAllText($asar)) 'original archive' 'Rollback archive'
    Assert-Equal ([IO.File]::ReadAllText((Join-Path $unpacked 'original.txt'))) 'original unpacked' 'Rollback unpacked files'
    Assert-Equal (Test-Path (Join-Path $unpacked 'injected.txt')) $false 'Rollback injection removal'
    Assert-Equal ($isPatched.Invoke($null, $installArgument)) $false 'Rolled-back installation'
    Assert-Equal (Test-Path $backup) $true 'Rollback preserves archive backup'
    Assert-Equal (Test-Path $unpackedBackup) $true 'Rollback preserves unpacked backup'

    [IO.File]::Delete($marker)
    Assert-Equal ($isPatched.Invoke($null, $installArgument)) $true 'Completed retry'
    [IO.File]::WriteAllText($marker, '')
    [IO.File]::WriteAllText((Join-Path $scratch 'FixtureClient.exe.stub'), 'original launcher')

    # Restore can only target this fixture's unique process name and scratch Squirrel root.
    Assert-Equal ([Diagnostics.Process]::GetProcessesByName($config.BrandName).Length) 0 'Fixture process isolation'
    $enhancerType.GetMethod('Restore').Invoke($enhancer, $null) | Out-Null
    foreach ($path in $backup, $unpackedBackup, $marker) {
        Assert-Equal (Test-Path $path) $false 'Restore clears patch state'
    }
    Assert-Equal ([IO.File]::ReadAllText((Join-Path $scratch 'FixtureClient.exe'))) 'original launcher' 'Restore launcher'
    Assert-Equal ($isPatched.Invoke($null, $installArgument)) $false 'Restored installation'
    Write-Host 'Desktop regression checks passed (native sizes, backups, rollback, retry state, restore).'
}
finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
