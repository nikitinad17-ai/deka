import hashlib,json,os,shutil,zipfile
from pathlib import Path
r=Path(__file__).resolve().parents[1];out=r/'prototype-out';out.mkdir(exist_ok=True)
report=json.loads((r/'test-output/wallpaper-prototype-report.json').read_text(encoding='utf-8'));assert report['stage']=='prototype' and report['background_verified'] is False and report['tests'] and all(t['passed']for t in report['tests'])
sha=os.environ['GITHUB_SHA'];run=os.environ['GITHUB_RUN_ID'];files={}
for name in ['Deka-Wallpaper.exe','Deka-Wallpaper-setup.exe']:
 p=r/name;assert p.read_bytes()[:2]==b'MZ';shutil.copy2(p,out/name);files[name]={'size':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
for name in ['wallpaper-prototype-report.json','native-integrity.json','webview-version.json']:shutil.copy2(r/'test-output'/name,out/name)
text=f'''DEKA Desktop Wallpaper 0.1.0 — ПРОМЕЖУТОЧНЫЙ ПРОТОТИП Windows x64.
Это отдельная экспериментальная сборка. Это НЕ готовый выпуск живых обоев.
Дата: 1 ноября 2026 года.

Что готово и проверено:
- Отдельные EXE, установщик, профиль ru.volna.deka.wallpaper; стабильный Desktop не заменяется.
- Обычное окно, активный пульт выбранного монитора, меню трея и возврат Escape.
- Два настоящих локальных MP3 одновременно; сохранение одного движка, позиций и ручного темпа при смене отображения.
- Измеренный переход автомикса около 17 секунд в обычном окне.
- Работа без повышения прав; автозапуск не добавляется.
- Скретч в этом направлении отключён по заданию.
- Безопасный возврат в окно с сообщением, если Explorer не предоставляет слой обоев.

Что НЕ подтверждено:
- Видимый пульт под реальными значками рабочего стола.
- Полная блокировка случайного управления и самостоятельный автомикс именно в режиме «Фон».
- Восстановление фонового режима после перезапуска Проводника.
- Два физических монитора, изменение DPI, отключение кабеля и клики по меню трея.
Поэтому кнопка «Фон» является экспериментальной; прохождение первых двух режимов не выдаётся за полноценные живые обои.

В доступной Windows CI-среде исходный Explorer принадлежит встроенной учётной записи администратора с повышенным токеном. Отдельная обычная тестовая учётная запись запускает EXE без повышения прав, но её Explorer не создаёт пригодный слой WorkerW: запрос возвращает E_FAIL. Визуальная проверка обнаружила отсутствие пульта в фоне; неподтверждённый fallback на обычный Progman убран. Точная причина совместимости с конкретной пользовательской Windows пока не установлена. Автоматический полноценный выпуск Wallpaper остаётся заблокирован строгой проверкой; опубликован только этот прототип.

Как запустить:
1. Закройте другие экземпляры DEKA. Распакуйте ZIP в отдельную папку и запустите Deka-Wallpaper.exe либо установите отдельный Deka-Wallpaper-setup.exe.
2. Откройте DJ · A/B, добавьте собственные аудиофайлы и назначьте треки в A/B. Для автомикса отключите REP 1 и включите AUTO MIX.
3. Выберите монитор в верхней панели. «Активно» разворачивает пульт; Escape и «Обычное окно» возвращают окно без остановки музыки.
4. Для завершения нажмите значок DEKA в системном трее → «Выход». Иконка может быть под стрелкой скрытых значков. Обычные обои и ярлыки не изменяются.

Минимальная проверка на Windows 10/11 для продолжения:
В обычной пользовательской сессии включите музыку, нажмите «Фон» и покажите рабочий стол (Win+D). Нужно увидеть пульт под значками, открыть ярлык без воздействия на музыку и вернуть пульт через трей. Если слой недоступен, приложение должно вернуться в обычное окно и показать сообщение. До этой проверки фоновый режим не считается принятым. Никакой настройки прав администратора или автозапуска для проверки не требуется.

Фактические результаты этой сборки: 44 Node-проверки, один Rust-тест геометрии и {len(report['tests'])} ограниченных проверок готового EXE. Они подтверждают только перечисленный выше объём прототипа. Полный отчёт в wallpaper-prototype-report.json. Субъективное качество на физическом аудиоустройстве пользователя и личный VK не проверялись.

База движка: Desktop 0.18.0, 7844358154a7a9122cb2a47a3b691d20b4d8269b.
Исходник бинарной сборки: {sha}.
Сборка и ограниченные проверки: https://github.com/nikitinad17-ai/deka/actions/runs/{run}
Ветка: feature/desktop-wallpaper-0.1.0. В main не объединено.
'''
(out/'READ-ME-FIRST.txt').write_text(text,encoding='utf-8');(out/'TEST-REPORT.txt').write_text(text,encoding='utf-8')
(out/'MANIFEST.json').write_text(json.dumps({'product':'Deka Desktop Wallpaper','version':'0.1.0-prototype.1','stage':'prototype','source_commit':sha,'workflow_run':run,'background_verified':False,'explorer_recovery_verified':False,'node_checks':44,'rust_geometry_tests':1,'prototype_native_checks':len(report['tests']),'files':files},indent=2))
(out/'SHA256SUMS.txt').write_text(''.join(v['sha256']+'  '+n+'\n'for n,v in files.items()))
with zipfile.ZipFile(out/'Deka-Desktop-Wallpaper-0.1.0-Prototype-Windows.zip','w',zipfile.ZIP_DEFLATED)as z:
 for p in sorted(out.iterdir()):
  if p.suffix!='.zip':z.write(p,p.name)
(out/'RELEASE-NOTES.md').write_text(f'''**Промежуточный прототип, не готовые живые обои.**
\nОтдельный EXE, установщик и ZIP. Подтверждены обычное окно, активный пульт, сохранение A/B/темпа при переключениях, Escape, 17-секундный автомикс в окне и безопасный возврат при недоступном слое Explorer. 44 Node-проверки, Rust-тест геометрии и {len(report['tests'])} ограниченных проверок готового EXE.
\n**Фон под значками, фоновый автомикс и восстановление после Explorer ещё не подтверждены.** Неподтверждённая привязка к Progman убрана. В доступной CI-среде нет пригодного обычного Explorer с нужным слоем WorkerW. Нужна проверка в обычной сессии пользовательской Windows 10/11; инструкция и точные ограничения — в ZIP. Стабильная DEKA не заменяется, автозапуск не добавляется.
\n[Проверки прототипа](https://github.com/nikitinad17-ai/deka/actions/runs/{run}), исходник `{sha}`. Полноценный выпуск Wallpaper не опубликован.
''',encoding='utf-8')
print('Packaged explicit prototype:',len(report['tests']),'native checks; background_verified=False')
