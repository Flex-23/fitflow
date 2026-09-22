# Registers a FitFlow worker to start with Windows.
#
# Run from an ADMINISTRATOR PowerShell in the project folder:
#     powershell -ExecutionPolicy Bypass -File scripts\install-worker-task.ps1 -Worker gate
#     powershell -ExecutionPolicy Bypass -File scripts\install-worker-task.ps1 -Worker gate -Uninstall
#
# The task runs as SYSTEM at boot, so the turnstile works before anyone logs
# in and keeps working after a power cut — nobody has to open the website or
# even sign into Windows. Members are admitted from the hosted database
# regardless of whether reception has the app open.
param(
  [ValidateSet("gate", "whatsapp")]
  [string]$Worker = "gate",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Error "Run this from an Administrator PowerShell — registering a boot task needs it."
  exit 1
}

$root = Split-Path $PSScriptRoot -Parent
$runner = Join-Path $PSScriptRoot "run-worker.ps1"
$taskName = "FitFlow $Worker"
$taskPath = "\FitFlow\"

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Removed scheduled task '$taskName'."
  exit 0
}

foreach ($f in @($runner, (Join-Path $root ".env"))) {
  if (-not (Test-Path $f)) { Write-Error "Missing required file: $f"; exit 1 }
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -Worker $Worker" `
  -WorkingDirectory $root

$trigger = New-ScheduledTaskTrigger -AtStartup
# SYSTEM so it runs with no user logged in and no stored password.
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)   # 0 = never kill it
# Give the network a moment to come up before the gate starts looking for the panel.
$settings.StartWhenAvailable = $true
$trigger.Delay = "PT30S"

Register-ScheduledTask `
  -TaskName $taskName -TaskPath $taskPath `
  -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "Keeps the FitFlow $Worker worker running. Starts 30s after boot, before anyone logs in." `
  -Force | Out-Null

Write-Output "Registered '$taskPath$taskName' — starts 30s after every boot."
Write-Output "Starting it now so you do not have to reboot..."
Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath
Start-Sleep -Seconds 3
Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath |
  Select-Object TaskName, State |
  Format-Table -AutoSize
Write-Output "Log: $root\storage\logs\$Worker.log"
