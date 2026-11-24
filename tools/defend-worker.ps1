# Defend model data worker (outpost-ops#273). One worker, idle priority, survives reboot via a logon scheduled task.
#   tools/defend-worker.ps1            run (or resume) the collect, then the fit; used by the scheduled task
#   tools/defend-worker.ps1 -Install   register the logon task "FO-DefendCollect" and start it now
#   tools/defend-worker.ps1 -Stop      stop the worker and remove the task
#   tools/defend-worker.ps1 -Fit       (pnpm defend:refresh) wipe nothing: collect for the new engine, then fit
param([switch]$Install, [switch]$Stop, [switch]$Fit, [int]$Seeds = 6, [int]$Hours = 72)
$repo = Split-Path -Parent $PSScriptRoot
$data = if ($env:DEFEND_DATA_DIR) { $env:DEFEND_DATA_DIR } else { "C:/Users/dougl/OneDrive - Module12 LLC/Desktop/Projects/Mobile game/fo-preserved-data/2026-11-24/defend-model" }
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
# #350: every start, exit and restart goes to worker-events.log; the collect prints one line per finished cell to worker-<n>.log.
# A collect that exits without reaching its stop target (crash, killed) is restarted after 60 s, up to 50 times.
$events = Join-Path $data "worker-events.log"
function Write-Event([string]$m) { Add-Content -Path $events -Value "$((Get-Date).ToString("o")) $m" }
Write-Event "worker start pid $PID seeds $Seeds hours $Hours data $data"
# start node.exe directly with vite-node's script: Start-Process could not launch pnpm.cmd from some
# terminals ("cannot find the file specified" even with the full path), so no .cmd shim is involved
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }
$viteNode = Join-Path $repo "node_modules\vite-node\vite-node.mjs"
Write-Event "node $node vite-node $viteNode"
$try = 0
while ($true) {
  $log = Join-Path $data "worker-$try.log"
  $proc = Start-Process -FilePath $node -ArgumentList @("`"$viteNode`"","tools/defend-collect.ts","--","--seeds",$Seeds,"--hours",$Hours) -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err"
  try { $proc.PriorityClass = "Idle" } catch {}
  Write-Event "collect start try $try pid $($proc.Id)"
  # the node child does the work: keep it at idle priority (it also lowers itself)
  for ($k = 0; $k -lt 12 -and -not $proc.HasExited; $k++) { Start-Sleep 5; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "defend-collect" } | ForEach-Object { try { (Get-Process -Id $_.ProcessId).PriorityClass = "Idle" } catch {} } }
  if (-not $proc) { Write-Event "collect could not start, worker stops: $($Error[0])"; Remove-Item $lock -ErrorAction SilentlyContinue; exit 1 }
  $proc.WaitForExit()
  $out = if (Test-Path $log) { (Get-Content $log -Tail 3 -ErrorAction SilentlyContinue) -join " | " } else { "" }
  $err = if (Test-Path "$log.err") { (Get-Content "$log.err" -Tail 5 -ErrorAction SilentlyContinue) -join " | " } else { "" }
  Write-Event "collect exit try $try code $($proc.ExitCode) last: $out err: $err"
  if ((Test-Path (Join-Path $data "COMPLETE")) -or $out -match "stop target reached|sample target reached") { Write-Event "collect finished"; break }
  $try++
  if ($try -ge 50) { Write-Event "giving up after 50 restarts"; break }
  Start-Sleep 60
}
# the collect ends on its stop target (deadline or sample target); fit whatever is there, then leave a marker
& $node $viteNode tools/defend-fit.ts -- *>> (Join-Path $data "fit.log")
Set-Content (Join-Path $data "FIT-DONE") (Get-Date).ToString("o")
Remove-Item $lock -ErrorAction SilentlyContinue
