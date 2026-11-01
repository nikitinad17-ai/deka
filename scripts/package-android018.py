"""Package only after native APK signing and every quality job succeeds."""
import hashlib,json,os,shutil,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'android018-out';out.mkdir(exist_ok=True);download=root/'ci-downloads'
apks=list((download/'deka-android').glob('*.apk'));assert len(apks)==1
apk=apks[0];digest=hashlib.sha256(apk.read_bytes()).hexdigest();verification=download/'android-native-verification';badging=(verification/'android-badging.txt').read_text();signature=(verification/'android-signature.txt').read_text();assert "ru.volna.player.djpreview018"in badging and "versionName='0.18.0'"in badging and 'arm64-v8a'in badging and 'Verified'in signature and digest in(verification/'android-sha256.txt').read_text()
with zipfile.ZipFile(apk)as z:assert any(n.startswith('lib/arm64-v8a/')for n in z.namelist())
counts={};reports=download/'browser-regression-results'
for name in ['report.json','desktop-dj-report.json','desktop-vinyl-report.json','android-dj-report.json','continuous-report.json','automix-report.json','mp3-transport-report.json','desktop-session-report.json','android018-report.json']:
 d=json.loads((reports/name).read_text());rows=d['tests']if isinstance(d,dict)else d;assert rows and all(t['passed']for t in rows);counts[name]=len(rows);shutil.copy2(reports/name,out/name)
source=os.environ['GITHUB_SHA'];run=os.environ['GITHUB_RUN_ID'];total=44+sum(counts.values())
manifest={'product':'Deka DJ Android','version':'0.18.0','source_commit':source,'workflow_run':run,'package':'ru.volna.player.djpreview018','abi':'arm64-v8a','apk':apk.name,'apk_sha256':digest,'checks':{'node':44,'browser_reports':counts,'total':total,'physical_android_tested':False,'live_vk_tested':False},'regular_fade_seconds':17,'reverse_seconds':[1.5,2.5,3.5],'separate_installation':True}
(out/'MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));shutil.copy2(apk,out/apk.name)
for name in ['android-badging.txt','android-signature.txt','android-sha256.txt']:shutil.copy2(verification/name,out/name)
report=f'''Дека DJ Android 0.18.0, arm64. Исходник {source}. Сборка https://github.com/nikitinad17-ai/deka/actions/runs/{run}.

Крупнее деки; Play / Next / CUE внизу каждой. Треки / Темп / Эквалайзер остаются отдельными вкладками. Low и High у внешних краёв A/B, Mid нейтрален; громкости и эффекты независимы. Nudge и постоянные инструкции к винилу убраны; удержание и скретч сохранены. CUE: поставить, вернуться, удалить, поставить снова. Смена файла очищает только его CUE.

Обычный автомикс использует общий проверенный Desktop-алгоритм: выбран переход 17 секунд; для слишком коротких файлов длительность автоматически сокращается. Это выбранное значение APK, а не новое пользовательское подтверждение. BPM меняет реальный decoder playbackRate, Key Lock сохраняет тональность; бас и громкость входят плавно. Реверс: 1,5 / 2,5 / 3,5 с. AUTO MIX включён — другая подготовленная дека входит до остановки; выключен — останавливается только выбранная. Пустой целевой трек не останавливает исходный, уже играющий не перематывается.

Все шесть эффектов Desktop: Flanger, Echo, Reverb, Filter, Phaser, Roll. Процессоры встроены в приложение; если политика страницы блокирует AudioWorklet blob, используется ограниченная по памяти обработка PCM ScriptProcessor. Она чувствительнее к нагрузке UI, поэтому нужна проверка на телефоне.

Проверено {total} автоматических условий: 44 Node и {sum(counts.values())} браузерных. Реальные CDP-касания и мультитач; 360×640, 390×844, 667×375, 844×390; удержание/скретч, поворот без замены движка, CUE A/B, Key Lock, независимость, реальные 17-секундные переходы A→B/B→A, 12 вариантов реверса, реальные PCM-эффекты и строгий CSP. APK собран Android SDK/NDK, проверены встроенные JS/DSP, системный выбор файлов, фоновые/ориентационные native-патчи, ABI, версия и подпись apksigner.

Физический Android, реальная сессия VK, экран сна телефона и его аудиоустройство здесь не проверялись. Браузерная эмуляция не выдаётся за тест телефона. Установка отдельная: Deka DJ 0.18 Preview, пакет ru.volna.player.djpreview018. Старую Деку удалять не нужно. Предыдущие Preview-пакеты не перезаписываются; сохранённый список между пакетами не переносится. Выберите файлы в новой версии.
'''
(out/'READ-ME.txt').write_text(report);(out/'TEST-REPORT.txt').write_text(report)
(out/'SHA256SUMS.txt').write_text(f'{digest}  {apk.name}\n')
with zipfile.ZipFile(out/'Deka-DJ-Android-0.18.0.zip','w',zipfile.ZIP_DEFLATED)as z:
 for p in sorted(out.iterdir()):
  if p.suffix!='.zip':z.write(p,p.name)
notes=f'''Android arm64: **{apk.name}**, версия 0.18.0. Отдельное приложение «Deka DJ 0.18 Preview»; прежнюю Деку удалять не нужно.

Крупнее деки, Play / Next / CUE внизу, Low/High у дек, нейтральный Mid. Полный цикл CUE, темп и Key Lock, шесть реальных FX. Автомикс по BPM, громкости и басу в обе стороны; выбран общий переход 17 с. Реверс 1,5 / 2,5 / 3,5 с с передачей другой деке при включённом автомиксе. Сохранены скретч, системный выбор файлов, фон и поворот.

{total} автоматических проверок, реальный аудиосигнал в мобильной браузерной эмуляции; проверены ABI/версия/подпись готового APK. **На физическом телефоне не проверялось.** Подробный отчёт и SHA256 — в ZIP. Исходник `{source}`. [Сборка](https://github.com/nikitinad17-ai/deka/actions/runs/{run}).
'''
(out/'RELEASE-NOTES.md').write_text(notes);print(json.dumps(manifest,ensure_ascii=False))
