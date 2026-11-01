import hashlib,json,os,shutil,zipfile
from pathlib import Path
r=Path(__file__).resolve().parents[1];out=r/'darmusic-out';out.mkdir(exist_ok=True)
source=json.loads((r/'test-output/darmusic-source-report.json').read_text());assert source['passed'] and source['inline_scripts_identical'] and source['native_backend_identical']
reports=[json.loads((r/'test-output'/n).read_text())for n in ['darmusic-native-visual.json','native-desktop-session-report.json']]
checks=[t for v in reports for t in v['tests']];assert checks and all(t['passed']for t in checks)
sha=os.environ['GITHUB_SHA'];run=os.environ['GITHUB_RUN_ID'];files={}
for name in ['Deka-DarMusic.exe','Deka-DarMusic-setup.exe']:
 p=r/name;assert p.read_bytes()[:2]==b'MZ';shutil.copy2(p,out/name);files[name]={'size':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
for name in ['darmusic-source-report.json','darmusic-native-visual.json','native-desktop-session-report.json','native-integrity.json','webview-version.json']:shutil.copy2(r/'test-output'/name,out/name)
text=f'''dar music · Deka Desktop 0.18.0 — отдельная версия Windows x64.

Распакуйте архив в отдельную папку и запустите Deka-DarMusic.exe, либо используйте Deka-DarMusic-setup.exe. Отдельные имя, установочная папка и профиль ru.volna.deka.darmusic. Обычная Deka не заменяется. Закройте другой плеер, чтобы избежать одновременной музыки. Интернет для локальных треков не нужен; требуется Windows WebView2.

Оформление по референсу обложки: угольные горы, золотой свет, рваные края, тёплый металл, надпись только «dar music». Название альбома не используется. Фон создан для этой версии.

Вся логика от опубликованной Desktop 0.18.0 (7844358154a7a9122cb2a47a3b691d20b4d8269b): A/B, скретч, CUE, Key Lock, темп, шесть эффектов, Реверс 1,5/2,5/3,5 с, исправленный Shuffle, 17-секундный автомикс. 17 JS-файлов, встроенные скрипты HTML и нативный backend побайтно совпадают с основой. Изменены CSS, фон, title и идентификатор отдельной сборки.

Для обычного сведения отключите REP 1 и включите AUTO MIX. Для локальных треков используйте «Файлы» или перетаскивание, назначайте треки в A/B. Закрытие окна завершает эту версию. Это обычный плеер, не эксперимент Wallpaper.

Фактические проверки: 44 Node-проверки; сравнение исходников; {len(checks)} проверок оформления и аудиосценариев внутри готового Windows EXE. Проверены звук A/B, темп/Key Lock, скретч обеих дек, эффекты, 17-секундные переходы, CUE, Реверс и SHUF. Точные результаты и ограничения в JSON. Физический аудиовыход пользователя и личная сессия VK не проверялись.

Исходник: {sha}
Сборка: https://github.com/nikitinad17-ai/deka/actions/runs/{run}
'''
(out/'READ-ME.txt').write_text(text,encoding='utf-8');(out/'TEST-REPORT.txt').write_text(text,encoding='utf-8')
(out/'MANIFEST.json').write_text(json.dumps({'product':'dar music','version':'0.18.0','source_commit':sha,'base_source':source['base_source'],'native_checks':len(checks),'files':files},indent=2))
(out/'SHA256SUMS.txt').write_text(''.join(v['sha256']+'  '+n+'\n'for n,v in files.items()))
with zipfile.ZipFile(out/'Deka-DarMusic-0.18.0-Windows.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(out.iterdir()):
  if p.suffix!='.zip':z.write(p,p.name)
(out/'RELEASE-NOTES.md').write_text(f'''Отдельная визуальная версия **dar music** на проверенной Desktop 0.18.0: тёмные горы, рваные края и золотой свет. Только «dar music», без названия альбома. Аудиодвижок и все контроллеры побайтно совпадают с Desktop 0.18.0.

Сохранены скретч, CUE, Key Lock, шесть FX, Реверс A/B, исправленный SHUF и автомикс 17 с. Отдельные EXE, установщик и настройки; стабильная Deka не заменяется.

44 Node-проверки, сравнение исходников и {len(checks)} проверок готового EXE в Windows. Личная сессия VK и физический аудиовыход пользователя не проверены. Инструкция и отчёты — в ZIP. [Сборка](https://github.com/nikitinad17-ai/deka/actions/runs/{run}), исходник `{sha}`.
''',encoding='utf-8')
print('Packaged dar music:',len(checks),'native checks')
