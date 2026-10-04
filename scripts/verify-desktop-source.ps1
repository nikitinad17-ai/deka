$ErrorActionPreference = 'Stop'
# Disposable CI only. Run the exact installed GUI at standard-user integrity;
# do not change machine/user policies or debug options in shipped application.
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Disposable Windows CI only' }
$link = Get-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Дека 2.lnk')
$shell = New-Object -ComObject Shell.Application
$folder = $shell.NameSpace([string]$link.DirectoryName)
$exe = [string]$folder.ParseName([string]$link.Name).GetLink.Path
if (!(Test-Path -LiteralPath $exe)) { throw 'Installed executable not found' }
python scripts/native-standard-user-ci.py "$exe"
if ($LASTEXITCODE -ne 0) { throw 'Installed standard-user WebView2 integration check failed' }
