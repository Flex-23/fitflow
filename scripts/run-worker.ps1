# Keeps a FitFlow worker alive and writes what it says to a log file.
#
# Registered in Task Scheduler by install-worker-task.ps1 so the gate starts
# with the computer, but it can also be run by hand to watch the log grow:
#     powershell -ExecutionPolicy Bypass -File scripts\run-worker.ps1 -Worker gate
#
# node and tsx are invoked directly rather than through `npm run`, because at
# boot the task may run before a user logs in, where npm is not reliably on
# the PATH.
param(
  [ValidateSet("gate", "whatsapp")]
  [string]$Worker = "gate",
  # Seconds to wait before restarting a worker that exited.
  [int]$RestartDelay = 10,
  # Rotate the log once it passes this size, keeping one previous file.
  [int]$MaxLogBytes = 5MB
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$entry = @{ gate = "scripts/gate-bridge.ts"; whatsapp = "scripts/whatsapp-worker.ts" }[$Worker]

$logDir = Join-Path $root "storage\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "$Worker.log"

$node = Join-Path $env:ProgramFiles "nodejs\node.exe"
if (-not (Test-Path $node)) { $node = (Get-Command node -ErrorAction Stop).Source }
$tsx = Join-Path $root "node_modules\tsx\dist\cli.mjs"

# The worker prints Arabic member names, and PowerShell's redirection
# operators would write the file as UTF-16 and decode the child's output with
# the ANSI codepage — either one turns those names into rubbish. Force UTF-8
# on both sides and append through Out-File instead.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

function Write-Log([string]$message) {
  "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message |
    Out-File -FilePath $log -Append -Encoding utf8
}

Set-Location $root
Write-Log "supervisor started for '$Worker' ($entry)"

while ($true) {
  # Keep one previous log so a long-running gate cannot fill the disk.
  if ((Test-Path $log) -and ((Get-Item $log).Length -gt $MaxLogBytes)) {
    Move-Item -Path $log -Destination "$log.old" -Force
    Write-Log "log rotated"
  }

  try {
    # --env-file makes the worker read .env exactly as `npm run gate` does.
    # Piped line by line so each one lands as UTF-8 and the log stays live
    # rather than appearing only when the worker eventually stops.
    & $node $tsx "--env-file=.env" $entry 2>&1 |
      ForEach-Object { $_ | Out-File -FilePath $log -Append -Encoding utf8 }
    $code = $LASTEXITCODE
  } catch {
    $code = -1
    Write-Log "failed to start: $($_.Exception.Message)"
  }

  Write-Log "worker exited (code $code) — restarting in ${RestartDelay}s"
  Start-Sleep -Seconds $RestartDelay
}
