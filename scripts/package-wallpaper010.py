import hashlib,json,os,shutil,zipfile
from pathlib import Path
r=Path(__file__).resolve().parents[1];out=r/'wallpaper-out';out.mkdir(exist_ok=True);report=json.loads((r/'test-output/wallpaper-native-report.json').read_text());assert report['tests']and all(t['passed']for t in report['tests']);assert any('Actual Explorer restart'in t['test']for t in report['tests']);assert any('Real background parent'in t['test']for t in report['tests']);assert any('Exit stops'in t['test']for t in report['tests'])
source=os.environ['GITHUB_SHA'];run=os.environ['GITHUB_RUN_ID'];files={}
for name in ['Deka-Wallpaper.exe','Deka-Wallpaper-setup.exe']:
 p=r/name;assert p.read_bytes()[:2]==b'MZ';files[name]={'size':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()};shutil.copy2(p,out/name)
for name in ['wallpaper-native-report.json','wallpaper-resource-report.json','native-integrity.json','webview-version.json']:shutil.copy2(r/'test-output'/name,out/name)
manifest={'product':'Deka Desktop Wallpaper','version':'0.1.0','source_commit':source,'base_desktop_version':'0.18.0','base_desktop_source':'7844358154a7a9122cb2a47a3b691d20b4d8269b','workflow_run':run,'identifier':'ru.volna.deka.wallpaper','node_checks':44,'native_checks':len(report['tests']),'physical_two_monitors_tested':False,'physical_hotplug_or_dpi_tested':False,'files':files};(out/'MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
text=f'''Deka Desktop Wallpaper 0.1.0 — отдельный эксперимент Windows x64.
Основа: Desktop 0.18.0, исходник 7844358154a7a9122cb2a47a3b691d20b4d8269b.
Текущий исходник {source}. https://github.com/nikitinad17-ai/deka/actions/runs/{run}

Распакуйте ZIP в отдельную папку и запустите Deka-Wallpaper.exe; либо используйте отдельный установщик. Идентификатор ru.volna.deka.wallpaper, отдельный профиль настроек; стабильная Дека сохранена. Администратор и автозапуск не нужны. Второй запуск открывает уже работающий экземпляр.

Выберите монитор вверху или в трее. «Активно» — пульт без рамки на выбранном экране, без принудительного topmost. Другие приложения доступны. «Фон» — настоящий дочерний слой WorkerW/Progman под ярлыками; мышь/колесо/клавиатура/drag-drop пультом не принимаются. Вернуться можно через значок трея: «Обычный режим» или «Открыть окно». «Обычное окно · Esc» и Escape возвращают окно из активного режима без остановки музыки. «Выход» в трее завершает приложение. Обычные обои Windows не изменяются.

Один существующий AudioContext и два локальных декодера сохраняют позиции, треки, BPM, Key Lock, EQ, громкости, очередь и кроссфейдер. Сохранён общий 17-секундный BPM/EQ-автомикс, эффекты и реверс. Скретч отключён в этом эксперименте. Визуальные обновления ограничены 10 раз/с, в фоне — 1 раз/с; анимации и визуальные meters при перекрытии/в фоне приостанавливаются, аудио-таймер продолжает работать.

При потере выбранного монитора или оболочки восстанавливается доступное окно. Watchdog проверяет мониторы/оболочку раз в секунду; трей регистрируется заново после перезапуска Explorer. Ошибка интеграции возвращает обычное окно с понятным сообщением.

Пройдено 44 Node-проверки, нативный Rust-тест геометрии нескольких мониторов и {len(report['tests'])} проверок готового EXE под обычным пользователем Windows. Проверены настоящие Win32-родители WorkerW/Progman, блокировка ввода, сохранение движка/звука при смене режимов, реальный 17-секундный переход в фоне, очередь, Escape, фактический перезапуск Explorer, повторный запуск и выход процесса. Отчёты приложены.

Физическая конфигурация двух мониторов, изменение DPI, отключение кабеля, клики по значку трея и личный VK требуют проверки на компьютере пользователя; CI проверяет реальную оболочку одного виртуального экрана и программную геометрию, не выдаёт это за два физических монитора. WorkerW — недокументированная часть Explorer, поэтому сборка экспериментальная; при несовместимой оболочке возвращается обычное окно.

Нагрузка измерена на одинаковых двух локальных MP3 короткими трёхсекундными отрезками в каждом режиме. CPU — проценты одного ядра по дереву процессов; RAM — сумма RSS, может учитывать общие страницы несколько раз. GPU-счётчики недоступны. Цифры/условия в wallpaper-resource-report.json; переносить их на личный ПК как гарантию нельзя.
'''
(out/'READ-ME.txt').write_text(text);(out/'TEST-REPORT.txt').write_text(text);(out/'SHA256SUMS.txt').write_text(''.join(v['sha256']+'  '+n+'\n'for n,v in files.items()))
with zipfile.ZipFile(out/'Deka-Desktop-Wallpaper-0.1.0-Windows.zip','w',zipfile.ZIP_DEFLATED)as z:
 for p in sorted(out.iterdir()):
  if p.suffix!='.zip':z.write(p,p.name)
(out/'RELEASE-NOTES.md').write_text(f'''Отдельный эксперимент Windows x64 на основе Desktop 0.18.0. **Deka-Wallpaper.exe**, отдельный установщик и ZIP.

Три настоящих режима: обычное окно, активный пульт на выбранном мониторе, фон под ярлыками WorkerW/Progman с заблокированным вводом. Трей, Escape, выбор монитора, один экземпляр, восстановление окна после перезапуска Explorer. Сохранены звук A/B, темп, 17-секундный автомикс, EQ/FX и очередь. Скретч отключён. Стабильная Дека не заменяется.

44 Node-проверки, тест геометрии Rust и {len(report['tests'])} проверок внутри готового EXE, включая настоящий перезапуск Explorer и звуковой переход в фоне. Физические два монитора/DPI/отключение кабеля и клики по трею ещё требуют проверки на ПК. Условия измерения CPU/RAM и ограничения — в ZIP. [Сборка](https://github.com/nikitinad17-ai/deka/actions/runs/{run}), исходник `{source}`.
''');print(json.dumps(manifest,ensure_ascii=False))
