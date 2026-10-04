$ErrorActionPreference = 'Stop'
# Fresh CI-only profile. Remote debugging is enabled only for this test process.
$oldArgs = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$oldProfile = $env:WEBVIEW2_USER_DATA_FOLDER
$profile = Join-Path $env:RUNNER_TEMP ('deka2-webview-probe-' + [guid]::NewGuid())
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9225'
$env:WEBVIEW2_USER_DATA_FOLDER = $profile
$link = Get-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Дека 2.lnk')
$shell = New-Object -ComObject Shell.Application
$folder = $shell.NameSpace([string]$link.DirectoryName)
$exe = [string]$folder.ParseName([string]$link.Name).GetLink.Path
$process = Start-Process -FilePath $exe -PassThru
try {
  $ready = $false
  for ($i=0; $i -lt 60; $i++) {
    try { $null = Invoke-WebRequest 'http://127.0.0.1:9225/json/version' -TimeoutSec 1; $ready=$true; break } catch { Start-Sleep -Milliseconds 500 }
  }
  if (!$ready) { throw 'The installed application did not expose its CI WebView2 endpoint' }
  python tests/desktop-flow.py --native
  if ($LASTEXITCODE -ne 0) { throw 'Actual installed WebView2 player/source integration test failed' }
} finally {
  Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=$oldArgs
  $env:WEBVIEW2_USER_DATA_FOLDER=$oldProfile
  Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
}
