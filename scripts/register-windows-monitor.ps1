[CmdletBinding()]
param(
  [string]$TaskName = "RobinhoodWalletAlerterMonitor",
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$DataDirectory = (Join-Path $RepositoryRoot "data"),
  [string]$DatabasePath = (Join-Path $DataDirectory "simulation.sqlite"),
  [string]$LogDirectory = (Join-Path $RepositoryRoot "logs"),
  [string]$StrategyVersion = "baseline-96h",
  [switch]$AtStartupOnly,
  [switch]$AtLogOnOnly
)

$ErrorActionPreference = "Stop"

if ($AtStartupOnly -and $AtLogOnOnly) {
  throw "Choose either -AtStartupOnly or -AtLogOnOnly, not both."
}

$RepositoryRoot = (Resolve-Path $RepositoryRoot).Path
$DataDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DataDirectory)
$DatabasePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DatabasePath)
$LogDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($LogDirectory)

New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $DatabasePath) -Force | Out-Null
New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null

$monitorLog = Join-Path $LogDirectory "monitor.log"
$nodeModulesBin = Join-Path $RepositoryRoot "node_modules\.bin"
$command = @"
`$env:SIMULATION_DATA_DIR = '$($DataDirectory.Replace("'", "''"))'
`$env:SIMULATION_DATABASE_PATH = '$($DatabasePath.Replace("'", "''"))'
`$env:MONITOR_LOG_DIR = '$($LogDirectory.Replace("'", "''"))'
`$env:STRATEGY_VERSION = '$($StrategyVersion.Replace("'", "''"))'
`$env:PATH = '$($nodeModulesBin.Replace("'", "''"));' + `$env:PATH
Set-Location '$($RepositoryRoot.Replace("'", "''"))'
npm run monitor *>> '$($monitorLog.Replace("'", "''"))'
"@

$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedCommand" -WorkingDirectory $RepositoryRoot

if ($AtStartupOnly) {
  $triggers = @(New-ScheduledTaskTrigger -AtStartup)
} elseif ($AtLogOnOnly) {
  $triggers = @(New-ScheduledTaskTrigger -AtLogOn)
} else {
  $triggers = @(
    New-ScheduledTaskTrigger -AtStartup
    New-ScheduledTaskTrigger -AtLogOn
  )
}

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 30) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Description "Runs the Robinhood Wallet Alerter live monitor after Windows boot or login." `
  -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName'."
Write-Host "Repository root: $RepositoryRoot"
Write-Host "Simulation database: $DatabasePath"
Write-Host "Data directory: $DataDirectory"
Write-Host "Monitor log: $monitorLog"
