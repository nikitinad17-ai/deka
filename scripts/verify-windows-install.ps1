$ErrorActionPreference = 'Stop'
$installer = Join-Path $pwd 'Deka2-setup.exe'
$p = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "Installer exit $($p.ExitCode)" }
$link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Дека 2.lnk'
if (!(Test-Path -LiteralPath $link -PathType Leaf)) { throw 'Desktop shortcut missing' }
$info = Get-Item -LiteralPath $link
Write-Output "Shortcut file: $($info.FullName), bytes: $($info.Length)"
if ($info.Length -lt 76) { throw 'Invalid shell-link header' }
try {
  $shell = New-Object -ComObject Shell.Application
  $folder = $shell.NameSpace([string]$info.DirectoryName)
  $item = $folder.ParseName([string]$info.Name)
  $target = $item.GetLink.Path
  Write-Output "Shell link target: $target"
} catch { Write-Output "Shell property diagnostic: $($_.Exception.Message)" }
# Test the user's real action: start the installed app THROUGH the shortcut.
# Checking a COM property alone is insufficient; verify the launched image bytes.
$before = @(Get-Process -Name 'deka2','Deka 2' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
Start-Process -FilePath $link -ErrorAction Stop
$started = $null
for ($i=0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  $started = Get-Process -Name 'deka2','Deka 2' -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $before } | Select-Object -First 1
  if ($started) { break }
}
if (!$started) {
  Get-ChildItem -LiteralPath ([Environment]::GetFolderPath('Desktop')) -Filter '*.lnk' | Select-Object Name,Length | Format-Table | Out-String | Write-Output
  Write-Output ([Convert]::ToBase64String([IO.File]::ReadAllBytes($link)))
  throw 'Desktop shortcut did not launch Deka 2'
}
try {
  $target = $started.Path
  if (!(Test-Path -LiteralPath $target)) { throw "Launched image missing: $target" }
  $expected = (Get-FileHash -LiteralPath (Join-Path $pwd 'Deka2.exe') -Algorithm SHA256).Hash
  $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  if ($actual -ne $expected) { throw 'Desktop shortcut launched a different executable' }
  Start-Sleep -Seconds 2
  if ($started.HasExited) { throw 'Installed app exited immediately after shortcut launch' }
  Write-Output "Verified shortcut launch: $link -> $target; SHA256: $actual"
} finally { Stop-Process -Id $started.Id -ErrorAction SilentlyContinue }
