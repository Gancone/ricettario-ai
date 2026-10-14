[CmdletBinding()]
param(
  [string]$ProductionUrl,
  [string]$ToolsDirectory = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'TOOLS')
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$officialIcon = Join-Path $projectDirectory 'public\icons\ricettario-ai.ico'
$siteConfiguration = Join-Path $projectDirectory 'public\branding\site.json'
if (-not $ProductionUrl) {
  $ProductionUrl = (Get-Content -LiteralPath $siteConfiguration -Raw | ConvertFrom-Json).productionUrl
}
$siteUri = $null
if (-not [Uri]::TryCreate($ProductionUrl, [UriKind]::Absolute, [ref]$siteUri) -or
    $siteUri.Scheme -ne 'https' -or $siteUri.UserInfo -or $siteUri.Query -or $siteUri.Fragment -or
    $siteUri.IsLoopback -or -not $siteUri.IsDefaultPort) {
  throw 'Specificare un URL Production HTTPS valido, senza credenziali o parametri.'
}
if (-not (Test-Path -LiteralPath $officialIcon -PathType Leaf)) { throw "Icona ufficiale mancante: $officialIcon" }

$toolsPath = [IO.Path]::GetFullPath($ToolsDirectory)
[IO.Directory]::CreateDirectory($toolsPath) | Out-Null
# Keep this stable copy outside the project folders replaced by normal installs.
$iconDirectory = Join-Path $toolsPath 'LOGHI'
[IO.Directory]::CreateDirectory($iconDirectory) | Out-Null
$stableIcon = Join-Path $iconDirectory 'RICETTARIO-AI.ico'
if ([IO.Path]::GetFullPath($officialIcon) -ne [IO.Path]::GetFullPath($stableIcon)) {
  Copy-Item -LiteralPath $officialIcon -Destination $stableIcon -Force
}
$shortcutPath = Join-Path $toolsPath 'Ricettario AI.lnk'
$windowsExplorer = Join-Path $env:WINDIR 'explorer.exe'
if (-not (Test-Path -LiteralPath $windowsExplorer -PathType Leaf)) { throw 'Windows Explorer non disponibile.' }
$wsh = New-Object -ComObject WScript.Shell
try {
  $shortcut = $wsh.CreateShortcut($shortcutPath)
  # Explorer delegates HTTPS to the current Windows default browser.
  $shortcut.TargetPath = $windowsExplorer
  $shortcut.Arguments = '"' + $siteUri.AbsoluteUri + '"'
  $shortcut.WorkingDirectory = $toolsPath
  $shortcut.IconLocation = $stableIcon + ',0'
  $shortcut.Description = 'Apri Ricettario AI Production nel browser predefinito'
  $shortcut.WindowStyle = 1
  $shortcut.Save()
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut) | Out-Null
}
finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($wsh) | Out-Null }
Write-Output "Collegamento: $shortcutPath"
Write-Output "Production: $($siteUri.AbsoluteUri)"
Write-Output "Icona: $stableIcon"
