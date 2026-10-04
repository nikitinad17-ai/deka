$ErrorActionPreference = 'Stop'
# Per-process settings only: never enable debugging in a released default or
# modify machine registry/policies. Use a fresh disposable CI browser profile.
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'This harness is only for the disposable CI runner' }
$out = Join-Path (Get-Location) 'test-output'
New-Item -ItemType Directory -Force $out | Out-Null
$profileDir = Join-Path $env:RUNNER_TEMP ('deka2-webview-probe-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force $profileDir | Out-Null
$link = Get-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Дека 2.lnk')
$shell = New-Object -ComObject Shell.Application
$folder = $shell.NameSpace([string]$link.DirectoryName)
$exe = [string]$folder.ParseName([string]$link.Name).GetLink.Path
if (!(Test-Path -LiteralPath $exe)) { throw 'Installed executable not found' }
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = $exe
$info.WorkingDirectory = Split-Path $exe
$info.UseShellExecute = $false
$info.RedirectStandardError = $true
$info.RedirectStandardOutput = $true
$info.Environment['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--remote-debugging-port=9225'
$info.Environment['WEBVIEW2_USER_DATA_FOLDER'] = $profileDir
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $info
if (!$process.Start()) { throw 'Process launch failed' }
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
Write-Host "CI launched installed executable: PID $($process.Id)"
$ready = $false
try {
  for ($i=0; $i -lt 50; $i++) {
    if ($process.HasExited) { throw "Installed application exited before browser initialization: $($process.ExitCode)" }
    try {
      $version = Invoke-RestMethod 'http://127.0.0.1:9225/json/version' -TimeoutSec 1 -NoProxy
      if ($version.webSocketDebuggerUrl) { $ready=$true; $version | ConvertTo-Json | Set-Content (Join-Path $out 'webview-version.json'); break }
    } catch { Start-Sleep -Milliseconds 400 }
  }
  if (!$ready) { throw 'Installed application did not open the per-process CDP endpoint; see startup-processes.json' }
  python tests/desktop-flow.py --native
  if ($LASTEXITCODE -ne 0) { throw 'Actual installed WebView2 player/source integration test failed' }
} finally {
  # This is an empty CI account, not user diagnostics. Record only the app and
  # its renderer commands, never environment values or a real account profile.
  Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('deka2.exe','msedgewebview2.exe') } |
    Select-Object Name,ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Depth 3 |
    Set-Content (Join-Path $out 'startup-processes.json')
  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 9225 } |
    Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json |
    Set-Content (Join-Path $out 'startup-listeners.json')
  if (!$process.HasExited) { & taskkill.exe /PID $process.Id /T /F 2>&1 | Out-Null }
  if ($stdout.Wait(2000)) { $stdout.Result | Set-Content (Join-Path $out 'startup-stdout.txt') }
  if ($stderr.Wait(2000)) { $stderr.Result | Set-Content (Join-Path $out 'startup-stderr.txt') }
  Get-Content (Join-Path $out 'startup-stderr.txt') -ErrorAction SilentlyContinue | Write-Host
  if (!$ready) { Get-Content (Join-Path $out 'startup-processes.json') | Write-Host }
  Remove-Item -LiteralPath $profileDir -Recurse -Force -ErrorAction SilentlyContinue
}
