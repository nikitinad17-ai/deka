$ErrorActionPreference = 'Stop'
$installer = Join-Path $pwd 'Deka2-setup.exe'
$p = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "Installer exit $($p.ExitCode)" }
$link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Дека 2.lnk'
if (!(Test-Path -LiteralPath $link)) { throw 'Desktop shortcut missing' }
$shell = New-Object -ComObject WScript.Shell
$target = $shell.CreateShortcut($link).TargetPath
Write-Output "Desktop shortcut: $link -> $target"
if (!(Test-Path -LiteralPath $target)) { throw "Desktop shortcut target missing: $target" }
# The installer may rename Cargo's binary to the product name. Verify bytes, not a guessed filename.
$expected = (Get-FileHash -LiteralPath (Join-Path $pwd 'Deka2.exe') -Algorithm SHA256).Hash
$actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'Desktop shortcut points to a different executable' }
Write-Output "Verified installed executable SHA256: $actual"
