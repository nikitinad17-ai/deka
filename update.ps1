# Обновление «Деки»: берёт самый свежий deka*.zip из «Загрузок», собирает и запускает.
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Обновление Деки'
$proj = $PSScriptRoot

function Fail($msg) {
  Write-Host ''
  Write-Host $msg -ForegroundColor Red
  Write-Host 'Сделайте скриншот этого окна и пришлите его.'
  Read-Host 'Нажмите Enter, чтобы закрыть'
  exit 1
}

Write-Host 'Закрываю Деку, если она открыта...'
Get-Process deka, volna -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 700

try { $downloads = (New-Object -ComObject Shell.Application).Namespace('shell:Downloads').Self.Path }
catch { $downloads = Join-Path $env:USERPROFILE 'Downloads' }

$zip = Get-ChildItem (Join-Path $downloads 'deka*.zip') -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($zip) {
  Write-Host "Распаковываю $($zip.Name) от $($zip.LastWriteTime)"
  $tmp = Join-Path $env:TEMP ('deka-update-' + [guid]::NewGuid())
  try {
    Expand-Archive -Force $zip.FullName $tmp
    $src = Join-Path $tmp 'deka'
    if (-not (Test-Path $src)) { $src = $tmp }
    Copy-Item -Path (Join-Path $src '*') -Destination $proj -Recurse -Force
  } catch { Fail "Не удалось распаковать архив: $_" }
  finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
} else {
  Write-Host 'Архив deka*.zip в Загрузках не найден, собираю то, что уже есть в папке.'
}

Set-Location $proj
$ErrorActionPreference = 'Continue'
if (-not (Test-Path (Join-Path $proj 'node_modules'))) {
  Write-Host 'Устанавливаю зависимости...'
  npm install
  if ($LASTEXITCODE -ne 0) { Fail 'npm install завершился с ошибкой.' }
}

Write-Host 'Собираю, это займёт 1-5 минут (первый раз до 10)...'
npm run build
if ($LASTEXITCODE -ne 0) { Fail 'Сборка не удалась.' }

# Ярлыки на рабочем столе: «Дека» (сам плеер) и «Обновить Деку» (этот скрипт).
# Путь к Deka.exe не меняется, поэтому ярлык всегда открывает самую свежую сборку.
# Старые ярлыки «Волны» убираем.
try {
  $desktop = [Environment]::GetFolderPath('Desktop')
  foreach ($old in 'Волна.lnk', 'Volna.lnk', 'Обновить Волну.lnk', 'олна.lnk') {
    Remove-Item (Join-Path $desktop $old) -ErrorAction SilentlyContinue
  }
  $exe = Join-Path $proj 'Deka.exe'
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut((Join-Path $desktop 'Дека.lnk'))
  $lnk.TargetPath = $exe
  $lnk.WorkingDirectory = $proj
  $lnk.IconLocation = $exe + ',0'
  $lnk.Description = 'Дека — ретро-плеер'
  $lnk.Save()
  $upd = $sh.CreateShortcut((Join-Path $desktop 'Обновить Деку.lnk'))
  $upd.TargetPath = Join-Path $proj 'update.cmd'
  $upd.WorkingDirectory = $proj
  $upd.IconLocation = $exe + ',0'
  $upd.Description = 'Собрать и запустить новую версию Деки из Загрузок'
  $upd.Save()
  Write-Host 'Ярлыки на рабочем столе обновлены.'
} catch { Write-Host "Не удалось создать ярлык: $_" -ForegroundColor Yellow }

Write-Host 'Запускаю Деку.'
Start-Process (Join-Path $proj 'Deka.exe')
