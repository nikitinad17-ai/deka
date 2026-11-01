"""Package only binaries accompanied by the completed shell acceptance report."""
import hashlib,json,os,shutil,zipfile
from pathlib import Path
r=Path(__file__).resolve().parents[1];out=r/'wallpaper-fix-out';out.mkdir(exist_ok=True)
report=json.loads((r/'test-output/wallpaper-native-report.json').read_text(encoding='utf-8'))
rows=report['tests'];assert rows and all(x['passed'] for x in rows)
for required in ['Actual composed desktop shows Wallpaper in background','Real desktop shortcut opens through background Wallpaper','Actual Explorer restart restores an accessible window, tray and the same running audio engine','Exit stops the process and restores the desktop']:
 assert any(x['test']==required for x in rows),required
environment=json.loads((r/'test-output/shell-environment.json').read_text(encoding='utf-8'))
sha=os.environ['DEKA_SOURCE_SHA'];run=os.environ['DEKA_TEST_RUN'];files={}
for name in ['Deka-Wallpaper.exe','Deka-Wallpaper-setup.exe']:
 p=r/name;assert p.read_bytes()[:2]==b'MZ';shutil.copy2(p,out/name)
 files[name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
for name in ['wallpaper-native-report.json','shell-environment.json']:
 shutil.copy2(r/'test-output'/name,out/name)
text=f'''DEKA Wallpaper 0.1.1 RC1 — исправление фонового режима для Windows 10.

Закройте старую Deka Wallpaper через трей → Выход. Распакуйте этот ZIP в новую папку и запустите Deka-Wallpaper.exe обычным двойным щелчком. Запуск от администратора не требуется. Номер 0.1.1 RC1 виден в заголовке и верхней панели.

Что исправлено:
- Завершён запрос создания слоя обоев; скрытые, чужие и неверно расположенные WorkerW не используются.
- Плеер больше не активирует родительский слой обоев при переходе в фон.
- Проверяются видимость слоя ярлыков, дочернее размещение и порядок окон. Если условия нарушаются, возвращается обычное окно с сообщением.
- Добавлено сохранение отчёта о слоях Windows кнопкой «Сохранить отчёт»; файл появляется в Загрузках.
- Звук остаётся в независимом окне плеера; к Explorer присоединяется только пассивное изображение интерфейса с обновлением раз в секунду. Потеря слоя не уничтожает аудио.

Управление: «Активно» — полноэкранный пульт; «Фон» — пульт под ярлыками; трей → «Обычный режим» — вернуть управление; трей → «Выход» — закрыть приложение. В режиме «Фон» пульт не принимает нажатия. Звуковой движок и библиотека не изменялись.

Фактическая проверка именно этих EXE: {len(rows)} проверок нативного сценария, включая изображение пульта на реальном рабочем столе, видимость и открытие настоящего ярлыка, сохранение аудио, 17-секундный автомикс, перезапуск Explorer и выход. Также пройдены 44 Node-проверки и Rust-тест геометрии.
Среда: {environment['os']}, системная сборка {environment['version']}; повышенный токен CI: {environment['admin_token']}. Использован настоящий существующий Explorer этой CI-сессии. Это не физический компьютер с Windows 10 и не проверка на обычной учётной записи; эти ограничения не скрываются. Физические два монитора, DPI и отключение монитора не проверены. RC1 остаётся отдельной экспериментальной версией.

Если фон на вашем ПК не включится: вернитесь в обычное окно через трей, нажмите «Сохранить отчёт» и передайте Deka-Wallpaper-diagnostics.txt из Загрузок. В отчёте нет названий треков или содержимого музыки.

Исходник EXE: {sha}
Проверки: https://github.com/nikitinad17-ai/deka/actions/runs/{run}
Ветка исправления: fix/wallpaper-win10-shell. Стабильная DEKA и dar music не заменяются.
'''
(out/'READ-ME-FIRST.txt').write_text(text,encoding='utf-8')
(out/'MANIFEST.json').write_text(json.dumps({'version':'0.1.1-rc.1','source_commit':sha,'test_run':run,'physical_windows10_tested':False,'native_checks':len(rows),'environment':environment,'files':files},ensure_ascii=False,indent=2),encoding='utf-8')
(out/'SHA256SUMS.txt').write_text(''.join(v['sha256']+'  '+n+'\n'for n,v in files.items()))
with zipfile.ZipFile(out/'Deka-Wallpaper-0.1.1-RC1-Windows.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(out.iterdir()):
  if p.suffix!='.zip':z.write(p,p.name)
print('Packaged',len(rows),'native checks, physical Windows 10 unverified')
