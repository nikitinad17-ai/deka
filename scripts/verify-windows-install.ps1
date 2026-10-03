$ErrorActionPreference = 'Stop'
$installer = Join-Path $pwd 'Deka2-setup.exe'
# Tauri stamps bundle-type information for NSIS; the portable binary may have a different stamp.
# The authoritative expected bytes are the executable actually packaged in THIS installer.
$sevenZip = (Get-Command 7z.exe -ErrorAction SilentlyContinue).Source
if (!$sevenZip) { $sevenZip = Join-Path $env:ProgramFiles '7-Zip\7z.exe' }
if (!(Test-Path -LiteralPath $sevenZip)) { throw '7-Zip is required to verify the installer payload' }
$extract = Join-Path $env:RUNNER_TEMP ('deka2-payload-' + [guid]::NewGuid())
New-Item -Path $extract -ItemType Directory | Out-Null
& $sevenZip x -y "-o$extract" $installer | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not extract installer for verification' }
$p = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "Installer exit $($p.ExitCode)" }
$link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Дека 2.lnk'
if (!(Test-Path -LiteralPath $link -PathType Leaf)) { throw 'Desktop shortcut missing' }
$info = Get-Item -LiteralPath $link
Write-Output "Shortcut file: $($info.FullName), bytes: $($info.Length)"
if ($info.Length -lt 76) { throw 'Invalid shell-link header' }
$shell = New-Object -ComObject Shell.Application
$folder = $shell.NameSpace([string]$info.DirectoryName)
$item = $folder.ParseName([string]$info.Name)
$shortcutTarget = [string]$item.GetLink.Path
Write-Output "Shell link target: $shortcutTarget"
if (!(Test-Path -LiteralPath $shortcutTarget -PathType Leaf)) { throw 'Shell link target missing' }
# Test the real desktop action, then verify the launched executable.
$before = @(Get-Process -Name 'deka2','Deka 2' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
Start-Process -FilePath $link -ErrorAction Stop
$started = $null
for ($i=0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  $started = Get-Process -Name 'deka2','Deka 2' -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $before } | Select-Object -First 1
  if ($started) { break }
}
if (!$started) { throw 'Desktop shortcut did not launch Deka 2' }
try {
  $target = $started.Path
  if (!(Test-Path -LiteralPath $target -PathType Leaf)) { throw "Launched image missing: $target" }
  if ([IO.Path]::GetFullPath($target) -ne [IO.Path]::GetFullPath($shortcutTarget)) { throw 'Shortcut launched unexpected image path' }
  $payload = @(Get-ChildItem -LiteralPath $extract -Recurse -File | Where-Object { $_.Name -eq [IO.Path]::GetFileName($target) })
  if ($payload.Count -ne 1) { throw 'Installer must contain exactly one matching application payload' }
  $expected = (Get-FileHash -LiteralPath $payload[0].FullName -Algorithm SHA256).Hash
  $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  $portable = (Get-FileHash -LiteralPath (Join-Path $pwd 'Deka2.exe') -Algorithm SHA256).Hash
  Write-Output "Packaged SHA256: $expected; installed: $actual; portable: $portable"
  if ($actual -ne $expected) { throw 'Installed executable does not match the NSIS payload' }
  Start-Sleep -Seconds 2
  if ($started.HasExited) { throw 'Installed app exited immediately after shortcut launch' }
  Write-Output "Verified shortcut launch and installer payload: $link -> $target"
} finally {
  Stop-Process -Id $started.Id -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
}
