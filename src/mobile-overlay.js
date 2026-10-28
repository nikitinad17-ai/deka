/* Deka 0.10: one durable library; two independent list views; landscape DJ console; set screen for VK Video.
 * Login pages of VK are left alone; without a login the VK page stays fully usable; the VK view
 * has an always-visible «← Дека» side tab instead of a bar over VK's own buttons. */
(function () {
  'use strict';
  if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;
  if (window.__dekaOverlay || !window.DekaLibrary || !window.DekaDecks) return;
  // Страницы входа и регистрации VK — без «Деки»: ничего не перекрываем, VK сам вернёт на сайт после входа.
  if (/^(id|login|oauth|connect|passport|account|auth|sso)\.vk\.(ru|com)$/.test(location.hostname) ||
      /^\/(login|join|restore|auth|signup|register|challenge|checkpoint|oauth|verify|blank\.php)(\/|$|\.)/.test(location.pathname)) return;
  window.__dekaOverlay = true;
  var css = `
    :host{all:initial}*{box-sizing:border-box}[hidden]{display:none!important}
    .app{--bg:#101318;--panel:#1b2029;--line:#343e4b;--a:#f5b44b;--b:#66d6e5;color:#e7ecf3;font:14px/1.3 system-ui,sans-serif;background:var(--bg);position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;overflow:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
    button,input,select{font:inherit}button{color:inherit;background:#262e3a;border:1px solid var(--line);border-radius:7px;min-height:36px;padding:5px 10px;cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--b);outline-offset:1px}button:disabled{opacity:.4;cursor:default}
    header{display:flex;align-items:center;gap:7px;padding:7px 10px;flex:none;min-height:48px;border-bottom:1px solid var(--line)}.brand{font-weight:900;color:var(--a);letter-spacing:.12em;margin-right:auto}.active{border-color:var(--a);color:var(--a)}
    .status{font-size:12px;color:#b4c4d6;min-height:26px;padding:4px 10px;background:#151c25;flex:none}.status.error{color:#ffc189}.status button{min-height:22px;padding:0 8px;margin-left:8px;font-size:11px}
    .library{flex:1;display:flex;flex-direction:column;min-height:0;padding:0 8px}.tools{display:flex;gap:6px;padding:7px 0;flex:none}.tools input{flex:1;min-width:0}input[type=search],select{color:#e7ecf3;background:#0d1117;border:1px solid var(--line);border-radius:6px;padding:6px;min-height:32px;min-width:0}select{max-width:180px}
    .vlviewport{position:relative;overflow:auto;flex:1;min-height:0;overscroll-behavior:contain;overflow-anchor:none}.vlcanvas{position:relative;width:100%}.vlrow{height:48px;min-height:48px;position:absolute;left:0;right:0;width:100%;display:flex;align-items:center;text-align:left;gap:9px;border:0;border-bottom:1px solid #232b36;border-radius:0;background:transparent;padding:5px 7px}.vlrow:hover{background:#222c39}.vlrow.selected{background:#332b1b;color:var(--a)}.number{color:#8a9db2;font-size:11px;min-width:32px;text-align:right}.trackmeta{min-width:0;flex:1}.trackmeta b,.trackmeta small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.trackmeta b{font-size:12px;font-weight:600}.trackmeta small{font-size:11px;color:#98aabd;margin-top:2px}
    .transport{display:flex;align-items:center;gap:7px;padding:7px 10px;min-height:54px;border-top:1px solid var(--line);flex:none}.now{flex:1;min-width:0}.now b,.now small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.now b{font-size:12px;color:var(--a)}.now small{font-size:10px;color:#a7b6c8}.empty{font-size:13px;color:#aab8c9;padding:12px}.count{font-size:11px;color:#a5b7cc;padding:4px;flex:none}
    .dj{position:absolute;inset:48px 0 54px;display:flex;flex-direction:column;background:var(--bg);transform:translateX(105%);visibility:hidden;transition:transform .22s ease,visibility .22s;overflow:hidden}.dj.open{transform:translateX(0);visibility:visible}.console{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:7px;padding:6px}.deck{display:flex;flex-direction:column;min-height:0;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden;--accent:var(--a)}.deck[data-side=B]{--accent:var(--b)}.deck h2{display:flex;align-items:center;gap:6px;margin:0;padding:5px 8px;color:var(--accent);font-size:12px;letter-spacing:.1em}.deck h2 small{font-weight:400;color:#acbccf;letter-spacing:0;margin-left:auto;font-size:10px}.deck .vlrow.selected{background:#263745;color:var(--accent)}
    .deckhead{display:flex;gap:8px;align-items:center;padding:0 8px 5px}.disc{flex:none;width:70px;height:70px;border-radius:50%;background:repeating-radial-gradient(circle,#101216 0 3px,#252930 4px 5px);border:2px solid #445162;position:relative}.disc:after{content:attr(data-letter);display:grid;place-items:center;position:absolute;inset:23px;border-radius:50%;color:#101318;background:var(--accent);font-weight:900}.disc.playing{animation:spin 2s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.decktitle{flex:1;min-width:0}.decktitle b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.decktitle small{color:#aebcd0;font-size:10px}.buttons{display:flex;gap:4px;margin-top:5px}.buttons button{padding:3px 7px;min-height:30px;font-size:11px}.play{color:var(--a)}input[type=range]{accent-color:var(--accent,var(--a));width:100%;min-width:0;margin:0;height:20px}.seek{padding:0 8px}.decktools{display:flex;gap:4px;padding:4px 6px}.decktools input{flex:1;width:40px}.decktools select{flex:1;width:65px;font-size:11px}.deck .count{padding-left:8px}.deck .vlviewport{margin:0 4px}
    .mixer{min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:5px;padding:6px 0}.mixer label{font-size:9px;color:#aebfd3;text-align:center;width:100%}.mixer .fader{writing-mode:vertical-lr;direction:rtl;height:65px;width:26px}.mixer button{padding:4px 5px;font-size:10px;min-height:28px}.mixer .pair{display:flex;gap:2px;width:100%}.mixer .pair label{width:50%}.mixer .eq{width:100%}.mixer .eq input{height:17px}.djinfo{font-size:10px;color:#b7c7db;display:flex;align-items:center;gap:8px;padding:2px 8px;min-height:24px}.djinfo input{max-width:170px;margin-left:auto}.djinfo b{color:var(--a)}
    .msg{position:absolute;left:10px;right:10px;bottom:60px;padding:10px;background:#3a2d17;border:1px solid #936b2d;border-radius:8px;z-index:20;font-size:12px}.app.djmode>.status{display:none}
    @media(orientation:landscape){.app header{min-height:38px;padding:3px 8px}.app header button{min-height:30px;font-size:12px}.dj{top:38px;bottom:48px}.transport{min-height:48px;padding:4px 8px}.disc{width:60px;height:60px}.disc:after{inset:19px}.deck h2{padding:3px 8px}.console{padding:4px;gap:5px}.deckhead{padding-bottom:0}.djinfo{min-height:20px}.mixer{gap:3px}.mixer .fader{height:54px}}
    @media(orientation:portrait){.dj .console{grid-template-columns:minmax(0,1fr) 58px minmax(0,1fr)}.deckhead{flex-direction:column;gap:4px}.decktitle{width:100%}.disc{width:60px;height:60px}.disc:after{inset:19px}.decktools{flex-direction:column}.decktools input,.decktools select{width:100%}.deck .number{min-width:20px}.djinfo{flex-wrap:wrap;font-size:9px}.deck .trackmeta b{font-size:11px}}
    .setview{flex:1;display:flex;flex-direction:column;min-height:0;padding:6px 10px 0;gap:6px}.sethead{display:flex;align-items:center;gap:8px}.settitle{flex:1;min-width:0}.settitle b,.settitle small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.settitle b{color:var(--a);font-size:14px}.settitle small{color:#a7b6c8;font-size:11px;margin-top:2px}
    .setbtns{display:grid;grid-template-columns:1fr 1.2fr 1fr 1.2fr 1fr;gap:5px}.setbtns button{padding:4px;font-size:12px;min-height:40px}.setbtns .play{font-size:18px;border-color:var(--a)}.setnow{font-size:12px;color:#d7e1ee;min-height:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.setnow b{color:var(--b)}
    .setnote{display:flex;align-items:center;gap:8px;font-size:12px;background:#1f2a20;border:1px solid #3f6b46;border-radius:7px;padding:4px 4px 4px 9px}.setnote span{flex:1}.setnote button{min-height:30px;font-size:12px}
    .chaps{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;border-top:1px solid var(--line)}.chap{display:flex;width:100%;align-items:center;gap:9px;text-align:left;border:0;border-bottom:1px solid #232b36;border-radius:0;background:transparent;min-height:44px;padding:5px 7px}.chap .number{min-width:48px;font-variant-numeric:tabular-nums}.chap .trackmeta b{white-space:normal;font-size:12px}.chap.current{background:#1a3038;color:var(--b)}.chap.current .number{color:var(--b)}.chapempty{font-size:12px;color:#aab8c9;padding:10px 4px}
    .paste textarea{width:100%;min-height:120px;color:#e7ecf3;background:#0d1117;border:1px solid var(--line);border-radius:6px;padding:6px;font:12px/1.4 ui-monospace,monospace;resize:vertical}
    .app.setmode .library{display:none}
    .status{display:flex;align-items:center;gap:6px}.status #statusText{flex:1;min-width:0}.status button{flex:none}
    .report{position:absolute;left:8px;right:8px;top:56px;z-index:30;display:flex;flex-direction:column;gap:6px;background:#151c25;border:1px solid var(--line);border-radius:9px;padding:10px;box-shadow:0 10px 30px rgba(0,0,0,.5)}.report small{color:#a7b6c8;font-size:11px}.report textarea{min-height:220px;color:#e7ecf3;background:#0d1117;border:1px solid var(--line);border-radius:6px;padding:6px;font:11px/1.35 ui-monospace,monospace;resize:vertical}
    @media(orientation:landscape){.setview{padding-top:3px;gap:4px}.setbtns button{min-height:34px}}
    .sidetab{position:fixed;right:0;top:var(--tab-top,38%);z-index:2147483646;min-height:46px;padding:6px 12px 6px 14px;border-radius:23px 0 0 23px;border:1px solid #936b2d;border-right:0;background:#f5b44b;color:#101318;font:800 14px/1 system-ui,sans-serif;letter-spacing:.02em;box-shadow:0 4px 16px rgba(0,0,0,.45);touch-action:none;user-select:none;-webkit-user-select:none}
    .guestnote{position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:2147483646;display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-radius:10px;background:#3a2d17;border:1px solid #936b2d;color:#fbe6c2;font:13px/1.3 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4)}.guestnote span{flex:1}.guestnote button{min-height:32px;border-color:#936b2d;background:#4a3a1f}
    @media(prefers-reduced-motion:reduce){.disc.playing{animation:none}.dj{transition:none}}
  `;
  var library, files = [], urls = [], playlists = [], sets = [], messageTimer, vkView = false, rotationOpened = false;
  var sh, $, app, mode = 'library', search = { main: '', A: '', B: '' }, source = { main: 'vk', A: 'vk', B: 'vk' }, lists = {}, sigs = {};
  var media = { paused: true, currentTime: 0, duration: 0, title: '', artist: '' }, engine, savedScope = '';
  var SETS = window.DekaSets || null, setLink = SETS && (/vkvideo\.ru$/.test(location.hostname) || /^\/(video|clip)/.test(location.pathname)) ? SETS.parseLink(location.href) : null;
  var setAuto = [], setManual = null, setTitleText = '', setChapSig = '', setCurrent = -2;
  function sfmt(s) { return SETS ? SETS.fmt(s) : fmt(s); }
  function command(c) { return window.__deka.cmd(c); }
  function fmt(s) { s = Math.max(0, Math.floor(+s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2,'0'); }
  function message(s) { $('message').textContent = s; $('message').hidden = false; clearTimeout(messageTimer); messageTimer = setTimeout(function () { $('message').hidden = true; }, 6500); }
  function sideHTML(side) { return `<section class="deck" data-side="${side}"><h2>DECK ${side}<small id="type${side}">Выберите трек</small></h2><div class="deckhead"><div class="disc" data-letter="${side}" id="disc${side}"></div><div class="decktitle"><b id="title${side}">Загрузите трек из списка</b><small id="time${side}">0:00 / 0:00</small><div class="buttons"><button data-cmd="prev" data-side="${side}" aria-label="Предыдущий ${side}">◀</button><button class="play" data-cmd="play" data-side="${side}" id="play${side}" aria-label="Играть ${side}">▶</button><button data-cmd="next" data-side="${side}" aria-label="Следующий ${side}">▶|</button><button data-cmd="cue" data-side="${side}" title="На паузе: поставить CUE; при игре: вернуться">CUE</button></div></div></div><div class="seek"><input id="seek${side}" data-seek="${side}" type="range" min="0" max="1000" value="0" aria-label="Позиция ${side}"></div><div class="decktools"><select data-source="${side}" id="source${side}" aria-label="Источник ${side}"></select><input type="search" data-search="${side}" id="search${side}" placeholder="Поиск ${side}" aria-label="Поиск ${side}"></div><div class="count" id="count${side}"></div><div id="list${side}" aria-label="Список деки ${side}"></div></section>`; }
  function mount() {
    if (!document.body) return setTimeout(mount, 100);
    var host = document.createElement('div'); host.id = 'deka-overlay'; document.documentElement.appendChild(host); sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = '<style>' + css + '</style>' + `<main class="app"><header><span class="brand">ДЕКА</span><button id="setBtn" hidden>Сет</button><button id="libraryBtn" class="active">Треки</button><button id="syncBtn">Загрузить всё</button><button id="djBtn">DJ ⇠</button><button id="vkBtn">VK</button></header><div class="status" id="status"><span id="statusText">Читаю библиотеку…</span><button id="bgBtn" hidden title="Разрешить Деке работать при выключенном экране">Разрешить фон</button><button id="reportBtn" title="Технический отчёт о странице VK, без названий треков">Отчёт</button></div><div class="report" id="reportBox" hidden><b>Отчёт о странице VK</b><small>Без названий треков, ссылок и id. Пришлите его, если список грузится неправильно.</small><textarea id="reportText" readonly aria-label="Отчёт"></textarea><div class="tools"><button id="reportCopy">Скопировать</button><button id="reportClose">Закрыть</button></div></div><section class="setview" id="setView" hidden aria-label="Сет VK Видео"><div class="sethead"><button id="setBack" title="Вернуться к своей музыке">← Музыка</button><div class="settitle"><b id="setTitle">Сет</b><small id="setTime">0:00 / 0:00</small></div></div><input id="setSeek" type="range" min="0" max="1000" value="0" aria-label="Позиция в сете" style="--accent:var(--a)"><div class="setbtns"><button data-set="back" aria-label="Назад 30 секунд">−30 с</button><button data-set="prev" aria-label="Предыдущий трек сета">⏮ Трек</button><button data-set="toggle" class="play" id="setPlay" aria-label="Играть или пауза">▶</button><button data-set="next" aria-label="Следующий трек сета">Трек ⏭</button><button data-set="fwd" aria-label="Вперёд 30 секунд">+30 с</button></div><div class="setnote" id="setNote" hidden><span id="setNoteText"></span><button data-set="restart">С начала</button></div><div class="setnow" id="setNow"></div><div class="chaps" id="chaps" aria-label="Треклист сета"></div><div class="tools"><button id="pasteBtn">Свой треклист</button><button id="rescanBtn">Искать в описании</button></div><div class="paste" id="pasteBox" hidden><textarea id="pasteText" placeholder="00:00 Исполнитель — Название&#10;03:15 Исполнитель — Название&#10;…"></textarea><div class="tools"><button id="pasteSave">Сохранить</button><button id="pasteClear">Убрать свой</button></div></div></section><section class="library"><div class="tools"><select data-source="main" id="sourcemain" aria-label="Источник"></select><input data-search="main" id="searchmain" type="search" placeholder="Название или исполнитель"><button id="fileBtn" title="Добавить свои аудиофайлы">＋ Файлы</button></div><div class="tools"><button id="saveBtn">Сохранить список</button><button id="currentBtn">Сейчас</button><button id="myBtn">Моя музыка VK</button><button id="cancelBtn" hidden>Стоп загрузки</button></div><div class="tools" id="setTools" hidden><input id="setUrl" type="url" placeholder="Ссылка на VK Видео"><button id="setAdd">Добавить сет</button></div><div class="count" id="countmain"></div><div id="listmain" aria-label="Все треки библиотеки"></div><div class="empty" id="empty" hidden>Откройте свою музыку в VK и нажмите «Загрузить всё». Сохраняется список названий, не аудиофайлы.</div></section><section class="dj" id="dj" aria-label="Две деки DJ"><div class="djinfo"><b>VK: один общий поток · Файлы: A + B</b><span id="djTotal"></span><input id="cross" type="range" min="-100" max="100" value="0" aria-label="Кроссфейдер A B"></div><div class="console">${sideHTML('A')}<section class="mixer" aria-label="Микшер"><label>MASTER<input id="master" type="range" min="0" max="100" value="80" aria-label="Master"></label><div class="pair"><label>A<input class="fader" data-gain="A" type="range" min="0" max="100" value="100" aria-label="Уровень A"></label><label>B<input class="fader" data-gain="B" type="range" min="0" max="100" value="100" aria-label="Уровень B"></label></div>${[0,1,2].map(function (band) { return `<label class="eq">${['LOW','MID','HIGH'][band]}<input data-eq="A" data-band="${band}" type="range" min="-12" max="12" value="0" aria-label="${['LOW','MID','HIGH'][band]} A"><input data-eq="B" data-band="${band}" type="range" min="-12" max="12" value="0" aria-label="${['LOW','MID','HIGH'][band]} B"></label>`; }).join('')}<button id="djFiles">＋ Файлы</button><button id="closeDj">К списку</button></section>${sideHTML('B')}</div></section><footer class="transport"><button id="mainPrev" aria-label="Предыдущий">|◀</button><div class="now"><b id="now">Выберите трек</b><small id="nowTime">Дека A</small></div><button id="mainPlay" class="play" aria-label="Играть пауза">▶</button><button id="mainNext" aria-label="Следующий">▶|</button></footer><div class="msg" id="message" hidden></div><input id="files" type="file" accept="audio/*" multiple hidden></main><button class="sidetab" id="sideTab" hidden aria-label="Вернуться в Деку" title="Вернуться в Деку. Язычок можно сдвинуть вверх или вниз">← Дека</button><div class="guestnote" id="guestNote" hidden role="status"><span>Войдите в VK. После входа «Дека» сама откроет «Мои треки».</span><button id="guestClose" aria-label="Скрыть подсказку">✕</button></div>`;
    $ = function (id) { return sh.getElementById(id); }; app = sh.querySelector('.app');
    engine = window.DekaDecks.create({ vk: command, change: renderPlayback, message: message });
    ['main','A','B'].forEach(function (id) { lists[id] = new window.DekaVirtualList($('list' + id), function (data, index) { if (data[index].kind === 'set') { location.assign(data[index].url); return; } var side = id === 'main' ? 'A' : id; engine.load(side, data, index); engine.play(side); }); });
    $('setAdd').onclick = function () {
      var link = SETS && SETS.parseLink($('setUrl').value);
      if (!link) return message('Нужна ссылка на видео VK: vkvideo.ru/video-…');
      var url = link.url;
      if (!sets.some(function (s) { return s.url === url; })) sets.push({ url: url, title: 'Сет ' + (sets.length + 1), duration: 0 });
      try { localStorage.setItem('deka:sets', JSON.stringify(sets)); } catch (_) { message('Сет не сохранён: хранилище заполнено'); }
      $('setUrl').value = ''; renderLists(false);
    };
    $('syncBtn').onclick = function () { if (isGuest) return needLogin(); asked = Date.now(); window.DekaLibrary.collect(); };
    $('reportBtn').onclick = function () {
      var r; try { r = window.DekaLibrary.report(); } catch (err) { r = { error: String(err) }; }
      $('reportText').value = JSON.stringify(r, null, 1); $('reportBox').hidden = false;
    };
    $('reportClose').onclick = function () { $('reportBox').hidden = true; };
    $('reportCopy').onclick = function () {
      var t = $('reportText'); t.focus(); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      if (!ok && navigator.clipboard) navigator.clipboard.writeText(t.value).then(function () { message('Отчёт скопирован'); }, function () { message('Выделите текст и скопируйте вручную'); });
      else message(ok ? 'Отчёт скопирован' : 'Выделите текст и скопируйте вручную');
    };
    // Android: если система может усыплять Деку, предлагаем снять ограничение (один системный диалог).
    var android = window.DekaAndroid;
    function bgCheck() { try { $('bgBtn').hidden = !(android && android.backgroundAllowed && !android.backgroundAllowed()); } catch (_) { $('bgBtn').hidden = true; } }
    $('bgBtn').onclick = function () {
      try { android.openBackgroundSettings(); } catch (_) {}
      var n = 0, t = setInterval(function () { bgCheck(); if (++n > 30 || $('bgBtn').hidden) clearInterval(t); }, 2000);
    };
    bgCheck();
    $('myBtn').onclick = function () { if (isGuest) return needLogin(); asked = Date.now(); window.DekaLibrary.collectMy(); };
    $('cancelBtn').onclick = function () { window.DekaLibrary.cancel(); };
    $('djBtn').onclick = function () { setMode('dj'); rotationOpened = false; };
    $('libraryBtn').onclick = function () { if (setLink) return goMusic(); setMode('library'); rotationOpened = false; };
    $('closeDj').onclick = function () { setMode(setLink ? 'set' : 'library'); rotationOpened = false; };
    $('setBtn').onclick = function () { setMode('set'); rotationOpened = false; };
    $('setBack').onclick = goMusic;
    $('setSeek').onchange = function () { if (media.duration) seekSet(media.duration * +$('setSeek').value / 1000); };
    $('pasteBtn').onclick = function () { $('pasteBox').hidden = !$('pasteBox').hidden; if (!$('pasteBox').hidden) { $('pasteText').value = setManual ? setManual.map(function (t) { return sfmt(t.time) + ' ' + t.title; }).join('\n') : ''; $('pasteText').focus(); } };
    $('pasteSave').onclick = function () {
      var list = SETS.parseTracklist($('pasteText').value, media.duration);
      if (!list.length) return message('Не нашёл треклист: нужно минимум 3 строки вида «03:15 Исполнитель — Название»');
      setManual = list; storeManual(); $('pasteBox').hidden = true; renderChapters(true); message('Треклист сохранён: ' + list.length + ' треков');
    };
    $('pasteClear').onclick = function () { setManual = null; storeManual(); $('pasteText').value = ''; $('pasteBox').hidden = true; renderChapters(true); };
    $('rescanBtn').onclick = function () { command({ type: 'setScan' }); message(setAuto.length ? 'Треклист из описания обновлён' : 'Ищу таймкоды в описании видео…'); };
    $('chaps').addEventListener('click', function (e) { var b = e.target.closest('[data-time]'); if (b) { seekSet(+b.dataset.time); if (media.paused) command({ type: 'play' }); } });
    $('fileBtn').onclick = $('djFiles').onclick = function () { $('files').click(); };
    $('mainPlay').onclick = function () { engine.toggle('A'); }; $('mainPrev').onclick = function () { engine.step('A', -1); }; $('mainNext').onclick = function () { engine.step('A', 1); };
    $('vkBtn').onclick = function () { setVkView(true); };
    $('guestClose').onclick = function () { guestClosed = true; $('guestNote').hidden = true; };
    // Язычок «← Дека»: касание — назад в Деку, перетаскивание — сдвинуть, чтобы не мешал странице VK.
    var tab = $('sideTab'), drag = null, dragged = false;
    try { var top = parseFloat(localStorage.getItem('deka:tabTop')); if (top >= 8 && top <= 88) tab.style.setProperty('--tab-top', top + '%'); } catch (_) {}
    tab.addEventListener('pointerdown', function (e) { drag = { y: e.clientY, top: tab.getBoundingClientRect().top, moved: false }; dragged = false; try { tab.setPointerCapture(e.pointerId); } catch (_) {} });
    tab.addEventListener('pointermove', function (e) {
      if (!drag) return; var dy = e.clientY - drag.y; if (Math.abs(dy) > 8) drag.moved = true;
      if (drag.moved) tab.style.setProperty('--tab-top', Math.max(8, Math.min(88, (drag.top + dy) / (innerHeight || 1) * 100)) + '%');
    });
    tab.addEventListener('pointerup', function () { if (!drag) return; dragged = drag.moved; drag = null; if (dragged) { try { localStorage.setItem('deka:tabTop', String(parseFloat(tab.style.getPropertyValue('--tab-top')))); } catch (_) {} } });
    tab.addEventListener('pointercancel', function () { drag = null; });
    tab.addEventListener('click', function () { if (dragged) { dragged = false; return; } setVkView(false); if (isGuest) message('Сначала войдите в VK: нажмите «VK»'); });
    $('currentBtn').onclick = function () { var t = engine.state.A.track; if (!t || !lists.main.jump(t.key)) message('Текущего трека нет в выбранном списке'); };
    $('saveBtn').onclick = function () {
      var items = displayed('main').filter(function (t) { return t.kind !== 'file'; });
      if (!items.length) return message('Выберите непустой список VK. Файлы остаются на устройстве.');
      playlists.push({ id: 'p' + Date.now(), name: 'Плейлист ' + (playlists.length + 1), tracks: items });
      try { localStorage.setItem('deka:playlists:v2:' + savedScope, JSON.stringify(playlists)); message('Сохранено ' + items.length + ' треков'); }
      catch (_) { message('Не удалось сохранить плейлист: хранилище заполнено'); }
      renderOptions();
    };
    $('files').onchange = function () {
      Array.from($('files').files).forEach(function (f) {
        var url = URL.createObjectURL(f); urls.push(url);
        files.push({ key: 'file:' + files.length + ':' + f.name, title: f.name.replace(/\.[^.]+$/, ''), artist: '', kind: 'file', url: url, duration: 0 });
      });
      $('files').value = ''; source.A = source.B = 'files'; renderOptions(); renderLists(true); setMode('dj');
    };
    sh.addEventListener('input', function (e) {
      var el = e.target;
      if (el.dataset.search) { search[el.dataset.search] = el.value; renderList(el.dataset.search, true); }
      if (el.dataset.gain) engine.setGain(el.dataset.gain, +el.value / 100);
      if (el.dataset.eq) engine.setEQ(el.dataset.eq, +el.dataset.band, +el.value);
      if (el.id === 'cross') engine.setCross(+el.value / 100);
      if (el.id === 'master') engine.setMaster(+el.value / 100);
    });
    sh.addEventListener('change', function (e) {
      var el = e.target;
      if (el.dataset.source) { source[el.dataset.source] = el.value; renderList(el.dataset.source, true); }
      if (el.dataset.seek) engine.seek(el.dataset.seek, engine.state[el.dataset.seek].duration * +el.value / 1000);
    });
    sh.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmd]'); if (!b) return;
      var side = b.dataset.side;
      if (b.dataset.cmd === 'play') engine.toggle(side);
      if (b.dataset.cmd === 'prev') engine.step(side, -1);
      if (b.dataset.cmd === 'next') engine.step(side, 1);
      if (b.dataset.cmd === 'cue') engine.cue(side);
    });
    sh.addEventListener('click', function (e) {
      var b = e.target.closest('[data-set]'); if (!b) return;
      var a = b.dataset.set, t = +media.currentTime || 0, tracks = chapters();
      if (a === 'toggle') command({ type: 'toggle' });
      if (a === 'back' || a === 'fwd') command({ type: 'skip', by: a === 'back' ? -30 : 30 });
      if (a === 'restart') { seekSet(0); $('setNote').hidden = true; }
      if (a === 'prev' || a === 'next') {
        var to = SETS.stepTime(tracks, t, a === 'next' ? 1 : -1);
        if (!tracks.length) command({ type: 'skip', by: a === 'next' ? 30 : -30 });
        else if (to === null) message('Это последний трек сета');
        else seekSet(to);
      }
    });
    var gesture = null;
    app.addEventListener('touchstart', function (e) { if (e.composedPath().some(function (el) { return el.tagName === 'INPUT' || el.tagName === 'SELECT'; })) { gesture = null; return; } var t = e.touches[0]; gesture = { x: t.clientX, y: t.clientY }; }, { passive: true });
    app.addEventListener('touchend', function (e) { if (!gesture) return; var t = e.changedTouches[0], dx = t.clientX - gesture.x, dy = t.clientY - gesture.y; gesture = null; if (Math.abs(dy) > 30 || Math.abs(dx) < 80) return; if (dx < 0) setMode('dj'); else setMode('library'); }, { passive: true });
    window.addEventListener('deka:library', function (e) { library = e.detail; renderLibrary(); });
    window.addEventListener('deka:vk:state', function (e) { media = e.detail || media; engine.noteVK(media); renderSet(); });
    window.addEventListener('deka:vk:settracks', function (e) { var d = e.detail || {}; if (!setLink || d.id !== setLink.id) return; setAuto = Array.isArray(d.tracks) ? d.tracks : []; if (d.title) setTitleText = d.title; renderChapters(false); renderSet(); });
    window.addEventListener('deka:vk:setresume', function (e) { var d = e.detail || {}; if (!setLink || d.id !== setLink.id) return; $('setNoteText').textContent = 'Продолжаю с ' + sfmt(d.time); $('setNote').hidden = false; setTimeout(function () { $('setNote').hidden = true; }, 15000); });
    window.addEventListener('deka:vk:ended', function () { engine.endedVK(); });
    window.addEventListener('deka:vk:fx', function (e) { if (e.detail && !e.detail.ok && mode === 'dj') message('Для этого потока VK эквалайзер недоступен. Для файлов обе деки работают независимо.'); });
    var landscape = matchMedia('(orientation: landscape)');
    function rotate() { if (vkView || setLink) return; if (landscape.matches) { setMode('dj'); rotationOpened = true; } else if (rotationOpened) { setMode('library'); rotationOpened = false; } requestAnimationFrame(function () { Object.values(lists).forEach(function (v) { v.render(); }); }); }
    landscape.addEventListener('change', rotate);
    if (!setLink) importSetReturn();
    library = window.DekaLibrary.get(); renderLibrary(); rotate(); renderPlayback();
    // Режим VK переживает переходы по страницам VK (пока вы сами не вернётесь в «Деку»).
    try { if (sessionStorage.getItem('deka:vkview') === '1') setVkView(true); } catch (_) {}
    checkGuest();
    new MutationObserver(function () { if (guestTimer === null) guestTimer = setTimeout(function () { guestTimer = null; checkGuest(); }, 400); })
      .observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { checkGuest(); autoStart(); }, 2500);
    // Мост мог прочитать треклист раньше, чем появился этот экран: просим прислать его ещё раз.
    if (setLink) { $('setBtn').hidden = false; $('status').hidden = true; $('syncBtn').hidden = true; loadManual(); renderChapters(true); setMode('set'); renderSet(); command({ type: 'setScan' }); }
    window.addEventListener('pagehide', function () { engine.destroy(); urls.forEach(function (u) { URL.revokeObjectURL(u); }); }, { once: true });
  }
  // ---------- режим VK, вход ----------
  var isGuest = false, guestClosed = false, guestTimer = null, asked = 0;
  var LOGIN = /^(войти|войти в vk|войти в вк|войти через vk id|войти по qr-коду|зарегистрироваться|регистрация|создать аккаунт|sign in|log in|login|sign up)$/i;
  function setVkView(on) {
    vkView = !!on; app.hidden = vkView; $('sideTab').hidden = !vkView;
    if (!vkView) $('guestNote').hidden = true;
    try { if (vkView) sessionStorage.setItem('deka:vkview', '1'); else sessionStorage.removeItem('deka:vkview'); } catch (_) {}
    if (!vkView) requestAnimationFrame(function () { Object.values(lists).forEach(function (v) { v.render(); }); });
  }
  function needLogin() { setVkView(true); guestClosed = false; $('guestNote').hidden = false; }
  // На странице видны «Войти»/«Зарегистрироваться» или поле пароля — вход не выполнен.
  function loggedOutPage() {
    if (document.querySelector("[data-testid='left_menu_login_button']")) return true;
    var pw = document.querySelector('input[type=password]'); if (pw && pw.getClientRects().length) return true;
    var els = document.querySelectorAll('a,button,[role=button]');
    for (var i = 0; i < els.length && i < 800; i++) {
      var t = (els[i].textContent || '').trim().replace(/\s+/g, ' ');
      if (t.length < 32 && LOGIN.test(t) && els[i].getClientRects().length) return true;
    }
    return false;
  }
  function checkGuest() {
    var g = loggedOutPage();
    if (g === isGuest) return;
    isGuest = g;
    if (g) {
      // Запомним, что после входа надо открыть свою музыку; прежний id аккаунта больше не считаем своим.
      try { sessionStorage.setItem('deka:afterLogin', '1'); localStorage.setItem('deka:afterLogin', String(Date.now())); localStorage.removeItem('deka:uid'); } catch (_) {}
      setVkView(true); $('guestNote').hidden = guestClosed;
    } else {
      $('guestNote').hidden = true;
      afterLogin();
    }
    renderLibrary();
  }
  function afterLogin() {
    var flag = false;
    try {
      flag = sessionStorage.getItem('deka:afterLogin') === '1' || +localStorage.getItem('deka:afterLogin') > Date.now() - 30 * 60 * 1000;
      sessionStorage.removeItem('deka:afterLogin'); localStorage.removeItem('deka:afterLogin');
    } catch (_) {}
    if (!flag || isGuest) return false;
    setVkView(false);
    var lib = window.DekaLibrary.get() || {};
    if (!setLink && !(lib.items && lib.items.length)) window.DekaLibrary.collectMy();
    return true;
  }
  // Свежая установка: вы вошли, а список пуст — один раз за сеанс сами открываем «Мои треки».
  function autoStart() {
    if (isGuest || setLink) return;
    if (afterLogin() || vkView) return;
    var lib = window.DekaLibrary.get() || {};
    if ((lib.items && lib.items.length) || !window.DekaLibrary.userId || !window.DekaLibrary.userId()) return;
    try { if (sessionStorage.getItem('deka:autoMy')) return; sessionStorage.setItem('deka:autoMy', '1'); } catch (_) { return; }
    window.DekaLibrary.collectMy();
  }
  function setMode(value) { mode = value; $('setView').hidden = mode !== 'set'; app.classList.toggle('setmode', mode === 'set'); $('setBtn').classList.toggle('active', mode === 'set'); $('dj').classList.toggle('open', mode === 'dj'); app.classList.toggle('djmode', mode === 'dj'); $('djBtn').classList.toggle('active', mode === 'dj'); $('libraryBtn').classList.toggle('active', mode === 'library'); requestAnimationFrame(function () { Object.values(lists).forEach(function (v) { v.render(); }); }); }
  function renderOptions() {
    var choices = [{ id: 'vk', name: 'Треки VK' }, { id: 'files', name: 'Мои файлы' }, { id: 'sets', name: 'Сеты / VK Видео' }].concat(playlists.map(function (p) { return { id: p.id, name: p.name }; }));
    ['main','A','B'].forEach(function (id) {
      var select = $('source' + id), signature = JSON.stringify(choices);
      if (select.dataset.signature !== signature) { select.replaceChildren(); choices.forEach(function (o) { var option = document.createElement('option'); option.value = o.id; option.textContent = o.name; select.appendChild(option); }); select.dataset.signature = signature; }
      if (!choices.some(function (o) { return o.id === source[id]; })) source[id] = 'vk'; select.value = source[id];
    });
  }
  function displayed(id) {
    var p = playlists.find(function (p) { return p.id === source[id]; });
    var items = source[id] === 'sets' ? sets.map(function (s) { return { key: s.url, title: s.title || 'Сет', artist: 'VK Видео' + (s.pos ? ' · остановились на ' + sfmt(s.pos) + (s.duration ? ' из ' + sfmt(s.duration) : '') : s.duration ? ' · ' + sfmt(s.duration) : ''), kind: 'set', url: s.url, duration: s.duration || 0 }; }) : source[id] === 'files' ? files : p ? p.tracks : ((library && library.items) || []);
    var q = search[id].trim().toLowerCase();
    return q ? items.filter(function (t) { return ((t.artist || '') + ' ' + t.title).toLowerCase().includes(q); }) : items;
  }
  function renderList(id, reset) {
    var items = displayed(id), signature = JSON.stringify(items.map(function (t) { return [t.key,t.title,t.artist]; }));
    if (reset || sigs[id] !== signature) { lists[id].set(items, reset); sigs[id] = signature; }
    $('count' + id).textContent = items.length + ' треков' + (search[id] ? ' · результат поиска' : '');
    if (id === 'main') { $('empty').hidden = !!items.length; $('setTools').hidden = source.main !== 'sets'; }
  }
  function renderLists(reset) { ['main','A','B'].forEach(function (id) { renderList(id, reset); }); }
  function renderLibrary() {
    var identity = String((library && library.source) || '').split('|')[0];
    if (identity !== savedScope) {
      savedScope = identity;
      try { playlists = JSON.parse(localStorage.getItem('deka:playlists:v2:' + savedScope)) || []; } catch (_) { playlists = []; }
      if (!Array.isArray(playlists)) playlists = [];
      // Preserve legacy playlists without silently treating an unscoped old cache as current VK data.
      try {
        if (!localStorage.getItem('deka:migrated:v2:' + savedScope)) {
          var old = JSON.parse(localStorage.getItem('deka:playlists')) || [];
          var all = JSON.parse(localStorage.getItem('deka:myAll')) || [];
          if (Array.isArray(old)) old.forEach(function (p) { if (p && Array.isArray(p.tracks)) playlists.push({ id: 'legacy-' + p.id, name: (p.name || 'Плейлист') + ' · из 0.8', tracks: DekaLibraryCore.merge([], p.tracks) }); });
          if (Array.isArray(all) && all.length) playlists.push({ id: 'legacy-myall', name: 'Список из 0.8 · локальная копия', tracks: DekaLibraryCore.merge([], all) });
          localStorage.setItem('deka:playlists:v2:' + savedScope, JSON.stringify(playlists));
          localStorage.setItem('deka:migrated:v2:' + savedScope, '1');
        }
        sets = JSON.parse(localStorage.getItem('deka:sets')) || [];
        if (!Array.isArray(sets)) sets = [];
        sets = sets.filter(function (s) { try { var u = new URL(s.url); return u.protocol === 'https:' && /(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(u.hostname); } catch (_) { return false; } });
      } catch (_) {}
      playlists = playlists.filter(function (p) { return p && p.id && typeof p.name === 'string' && Array.isArray(p.tracks); });
    }
    renderOptions(); renderLists(false);
    var l = library || {}, n = (l.items || []).length, expected = l.expected;
    var reason = { 'open-own-library':'нажмите «Загрузить всё» — загружу «Мои треки» целиком', 'not-loaded':'нажмите «Загрузить всё»', partial:'список ещё загружается', 'end-observed':'дошли до конца списка', 'missing-tracks':'VK не отдал весь список', stalled:'Загрузка остановилась', 'source-changed':'Открыт другой список', cancelled:'Загрузка остановлена вами', 'no-rows':'На странице пока нет треков', limit:'Достигнут лимит прохода', 'read-error':'Ошибка чтения страницы', 'count-conflict':'Число треков не совпало', 'choose-library':'Откройте «Мои треки» в VK' };
    var status = l.status === 'loading' ? 'Загружаю: ' + (l.scanned || n) + (expected ? ' из ' + expected : '') + ' · список уже доступен' : l.complete ? (l.reason === 'count-matched' ? 'Загружено всё: ' + n + ' из ' + expected : 'Дошли до конца страницы · ' + n + ' треков') : 'Сохранено ' + n + (expected ? ' из ' + expected : '') + ' · ' + (reason[l.reason] || 'нажмите «Загрузить всё»');
    if (isGuest) status = 'Вы не вошли в VK — нажмите «VK» и войдите';
    if (l.reason === 'choose-library' && Date.now() - asked < 8000) { asked = 0; message('Не нашёл ваш список «Мои треки». Откройте его в VK — «Дека» подхватит.'); setVkView(true); }
    $('statusText').textContent = status; $('status').classList.toggle('error', l.status === 'partial' || isGuest);
    $('syncBtn').disabled = l.status === 'loading'; $('syncBtn').textContent = l.status === 'loading' ? 'Загрузка…' : 'Загрузить всё'; $('cancelBtn').hidden = l.status !== 'loading';
    $('djTotal').textContent = n + (expected ? '/' + expected : '') + ' треков';
    if (l.storageError) message('Хранилище заполнено: этот список доступен только до закрытия приложения');
  }
  // ---------- сет VK Видео ----------
  function chapters() { return setManual || setAuto || []; }
  // Перемотка сразу отражается на экране, не дожидаясь следующего отчёта моста.
  function seekSet(time) { time = Math.max(0, +time || 0); command({ type: 'seek', time: time }); media = Object.assign({}, media, { currentTime: time }); renderSet(); }
  function manualKey() { return 'deka:settracks:' + (setLink ? setLink.id : ''); }
  function loadManual() { try { var v = JSON.parse(localStorage.getItem(manualKey())); setManual = Array.isArray(v) && v.length ? v : null; } catch (_) { setManual = null; } }
  function storeManual() { try { if (setManual) localStorage.setItem(manualKey(), JSON.stringify(setManual)); else localStorage.removeItem(manualKey()); } catch (_) { message('Треклист не сохранён: хранилище заполнено'); } }
  function renderChapters(force) {
    if (!setLink || !$) return;
    var list = chapters(), sig = JSON.stringify(list) + (setManual ? '|m' : '');
    if (!force && sig === setChapSig) return;
    setChapSig = sig; setCurrent = -2;
    var box = $('chaps'); box.replaceChildren();
    if (!list.length) { var e = document.createElement('div'); e.className = 'chapempty'; e.textContent = 'В описании пока не нашлось таймкодов. Кнопки «Трек» перематывают на 30 секунд. Треклист можно вставить вручную.'; box.appendChild(e); return; }
    list.forEach(function (t, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chap'; b.dataset.time = String(t.time); b.dataset.index = String(i);
      var n = document.createElement('span'); n.className = 'number'; n.textContent = sfmt(t.time);
      var m = document.createElement('span'); m.className = 'trackmeta'; var bt = document.createElement('b'); bt.textContent = t.title; m.appendChild(bt);
      b.appendChild(n); b.appendChild(m); box.appendChild(b);
    });
  }
  function renderSet() {
    if (!setLink || !$) return;
    var t = +media.currentTime || 0, d = +media.duration || 0, list = chapters();
    if (media.title && media.setId === setLink.id) setTitleText = media.title;
    $('setTitle').textContent = setTitleText || 'Сет VK Видео';
    $('setTime').textContent = sfmt(t) + ' / ' + (d ? sfmt(d) : '—') + (list.length ? ' · ' + list.length + ' треков' + (setManual ? ' (свой список)' : '') : '');
    $('setPlay').textContent = media.paused ? '▶' : 'Ⅱ';
    if (sh.activeElement !== $('setSeek')) $('setSeek').value = d ? Math.floor(t / d * 1000) : 0;
    var i = SETS.chapterAt(list, t);
    $('setNow').replaceChildren();
    if (i >= 0) { var b = document.createElement('b'); b.textContent = (i + 1) + '. '; $('setNow').appendChild(b); $('setNow').appendChild(document.createTextNode(list[i].title)); }
    if (i !== setCurrent) {
      setCurrent = i;
      Array.prototype.forEach.call($('chaps').querySelectorAll('.chap'), function (c) { c.classList.toggle('current', +c.dataset.index === i); });
      var cur = $('chaps').querySelector('.chap.current'); if (cur && mode === 'set') { try { cur.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
    }
  }
  // Назад к музыке ВК: позицию и название сета передаём во фрагменте адреса,
  // потому что хранилище vkvideo.ru и vk.ru раздельное.
  function goMusic() {
    var info = { id: setLink.id, kind: setLink.kind, title: setTitleText, t: Math.floor(+media.currentTime || 0), d: Math.floor(+media.duration || 0) };
    location.assign('https://vk.ru/audio#deka-set=' + encodeURIComponent(JSON.stringify(info)));
  }
  function importSetReturn() {
    var m = /deka-set=([^&]+)/.exec(location.hash || ''); if (!m || !SETS) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    var info; try { info = JSON.parse(decodeURIComponent(m[1])); } catch (_) { return; }
    var link = info && SETS.parseLink('https://vkvideo.ru/' + (info.kind === 'clip' ? 'clip' : 'video') + String(info.id || ''));
    if (!link || link.id !== String(info.id)) return;
    try {
      var list = JSON.parse(localStorage.getItem('deka:sets')) || []; if (!Array.isArray(list)) list = [];
      var s = list.find(function (x) { return x && x.url === link.url; });
      if (!s) { s = { url: link.url, title: '', duration: 0 }; list.push(s); }
      var title = String(info.title || '').slice(0, 140);
      if (title && (!s.title || /^Сет \d+$/.test(s.title))) s.title = title;
      var d = +info.d || 0, t = +info.t || 0;
      if (d > 0) s.duration = d;
      s.pos = SETS.resumePoint(t, d) || 0;
      localStorage.setItem('deka:sets', JSON.stringify(list));
    } catch (_) {}
  }
  function renderPlayback() {
    if (!engine || !$) return;
    ['A','B'].forEach(function (side) {
      var s = engine.state[side], t = s.track;
      $('title' + side).textContent = t ? t.title : 'Выберите трек ниже';
      $('type' + side).textContent = t ? t.kind === 'file' ? 'Файл · независимая дека' : 'VK · общий поток' : 'Список готов';
      $('time' + side).textContent = fmt(s.time) + ' / ' + fmt(s.duration);
      $('play' + side).textContent = s.pending ? '…' : s.paused ? '▶' : 'Ⅱ';
      $('disc' + side).classList.toggle('playing', !s.paused);
      if (sh.activeElement !== $('seek' + side)) $('seek' + side).value = s.duration ? Math.floor(s.time / s.duration * 1000) : 0;
      lists[side].current(t && t.key);
    });
    var a = engine.state.A, b = engine.state.B;
    $('now').textContent = a.track ? (a.track.artist ? a.track.artist + ' — ' : '') + a.track.title : 'Выберите трек в списке';
    $('nowTime').textContent = 'A ' + fmt(a.time) + (b.track ? ' · B ' + fmt(b.time) : ''); $('mainPlay').textContent = a.paused ? '▶' : 'Ⅱ'; lists.main.current(a.track && a.track.key);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
