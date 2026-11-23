# Defend model data worker (outpost-ops#273). One worker, idle priority, survives reboot via a logon scheduled task.
#   tools/defend-worker.ps1            run (or resume) the collect, then the fit; used by the scheduled task
#   tools/defend-worker.ps1 -Install   register the logon task "FO-DefendCollect" and start it now
#   tools/defend-worker.ps1 -Stop      stop the worker and remove the task
#   tools/defend-worker.ps1 -Fit       (pnpm defend:refresh) wipe nothing: collect for the new engine, then fit
param([switch]$Install, [switch]$Stop, [switch]$Fit, [int]$Seeds = 6, [int]$Hours = 72)
$repo = Split-Path -Parent $PSScriptRoot
$data = if ($env:DEFEND_DATA_DIR) { $env:DEFEND_DATA_DIR } else { "C:/Users/dougl/OneDrive - Module12 LLC/Desktop/Projects/Mobile game/fo-preserved-data/2026-11-20/defend-model" }
$lock = Join-Path $data "worker.pid"
New-Item -ItemType Directory -Force $data | Out-Null
if ($Stop) {
  Unregister-ScheduledTask -TaskName "FO-DefendCollect" -Confirm:$false -ErrorAction SilentlyContinue
  if (Test-Path $lock) { $p = [int](Get-Content $lock); Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $p -or $_.ProcessId -eq $p } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Remove-Item $lock -ErrorAction SilentlyContinue }
  Write-Output "stopped"; exit 0
}
if ($Install) {
  $a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Seeds $Seeds -Hours $Hours"
  $t = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 10) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName "FO-DefendCollect" -Action $a -Trigger $t -Settings $s -Force | Out-Null
  Start-ScheduledTask -TaskName "FO-DefendCollect"
  Write-Output "installed and started"; exit 0
}
# single instance: a live pid in the lock file means another worker is running
if ((Test-Path $lock) -and -not $Fit) { $old = [int](Get-Content $lock); if (Get-Process -Id $old -ErrorAction SilentlyContinue) { Write-Output "worker already running (pid $old)"; exit 0 } }
if (-not $Fit) { Set-Content $lock $PID }
$log = Join-Path $data "worker.log"
Set-Location $repo
$proc = Start-Process -FilePath "pnpm.cmd" -ArgumentList @("exec","vite-node","tools/defend-collect.ts","--","--seeds",$Seeds,"--hours",$Hours) -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err"
try { $proc.PriorityClass = "Idle" } catch {}
$proc.WaitForExit()
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "defend-collect" } | ForEach-Object { try { (Get-Process -Id $_.ProcessId).PriorityClass = "Idle" } catch {} }
# the collect ends on its stop target (deadline or sample target); fit whatever is there, then leave a marker
& pnpm.cmd exec vite-node tools/defend-fit.ts -- *>> (Join-Path $data "fit.log")
Set-Content (Join-Path $data "FIT-DONE") (Get-Date).ToString("o")
Remove-Item $lock -ErrorAction SilentlyContinue
