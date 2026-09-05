$assembly = [System.Reflection.Assembly]::LoadFrom((Convert-Path './out/WandEnhancer.exe'))
$type = $assembly.GetType('WandEnhancer.Core.Js.JsCursor')
$text = [string](Get-Content -Raw -Path "scripts/tests/patch-locators.js")
$cursor = [System.Activator]::CreateInstance($type, [object[]]($text))
$cursor.GetType().FullName
