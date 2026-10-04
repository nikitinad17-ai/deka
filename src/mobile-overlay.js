/* Deka 0.9: one durable library; two independent list views; landscape DJ console. */
(function () {
  'use strict';
  if (window.top !== window || (!window.DEKA_DESKTOP_SHELL && !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname))) return;
  if (window.__dekaOverlay || !window.DekaLibrary || !window.DekaDecks) return;
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
    .vkview{inset:auto 0 0;height:54px;padding:0}.vkview header,.vkview>.status,.vkview .library,.vkview .dj{display:none}.vkview .transport{height:54px}.msg{position:absolute;left:10px;right:10px;bottom:60px;padding:10px;background:#3a2d17;border:1px solid #936b2d;border-radius:8px;z-index:20;font-size:12px}.app.djmode>.status{display:none}.app.desktop.djmode>.status{display:block;position:absolute;top:48px;left:0;right:0;z-index:5}.app.desktop.djmode .dj{top:78px}
    @media(orientation:landscape){.app header{min-height:38px;padding:3px 8px}.app header button{min-height:30px;font-size:12px}.dj{top:38px;bottom:48px}.transport{min-height:48px;padding:4px 8px}.disc{width:60px;height:60px}.disc:after{inset:19px}.deck h2{padding:3px 8px}.console{padding:4px;gap:5px}.deckhead{padding-bottom:0}.djinfo{min-height:20px}.mixer{gap:3px}.mixer .fader{height:54px}}
    @media(orientation:portrait){.dj .console{grid-template-columns:minmax(0,1fr) 58px minmax(0,1fr)}.deckhead{flex-direction:column;gap:4px}.decktitle{width:100%}.disc{width:60px;height:60px}.disc:after{inset:19px}.decktools{flex-direction:column}.decktools input,.decktools select{width:100%}.deck .number{min-width:20px}.djinfo{flex-wrap:wrap;font-size:9px}.deck .trackmeta b{font-size:11px}}
    @media(prefers-reduced-motion:reduce){.disc.playing{animation:none}.dj{transition:none}}
  `;
  var library, files = [], urls = [], playlists = [], sets = [], messageTimer, vkView = false, rotationOpened = false;
  var sh, $, app, mode = 'library', search = { main: '', A: '', B: '' }, source = { main: 'vk', A: 'vk', B: 'vk' }, lists = {}, sigs = {};
  var media = { paused: true, currentTime: 0, duration: 0, title: '', artist: '' }, engine, savedScope = '';
  function command(c) { return window.__deka.cmd(c); }
  function fmt(s) { s = Math.max(0, Math.floor(+s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2,'0'); }
  function message(s) { $('message').textContent = s; $('message').hidden = false; clearTimeout(messageTimer); messageTimer = setTimeout(function () { $('message').hidden = true; }, 6500); }
  function sideHTML(side) { return `<section class="deck" data-side="${side}"><h2>DECK ${side}<small id="type${side}">Выберите трек</small></h2><div class="deckhead"><div class="disc" data-letter="${side}" id="disc${side}"></div><div class="decktitle"><b id="title${side}">Загрузите трек из списка</b><small id="time${side}">0:00 / 0:00</small><div class="buttons"><button data-cmd="prev" data-side="${side}" aria-label="Предыдущий ${side}">◀</button><button class="play" data-cmd="play" data-side="${side}" id="play${side}" aria-label="Играть ${side}">▶</button><button data-cmd="next" data-side="${side}" aria-label="Следующий ${side}">▶|</button><button data-cmd="cue" data-side="${side}" title="На паузе: поставить CUE; при игре: вернуться">CUE</button></div></div></div><div class="seek"><input id="seek${side}" data-seek="${side}" type="range" min="0" max="1000" value="0" aria-label="Позиция ${side}"></div><div class="decktools"><select data-source="${side}" id="source${side}" aria-label="Источник ${side}"></select><input type="search" data-search="${side}" id="search${side}" placeholder="Поиск ${side}" aria-label="Поиск ${side}"></div><div class="count" id="count${side}"></div><div id="list${side}" aria-label="Список деки ${side}"></div></section>`; }
  function mount() {
    if (!document.body) return setTimeout(mount, 100);
    var host = document.createElement('div'); host.id = 'deka2-overlay'; document.documentElement.appendChild(host); sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = '<style>' + css + '</style>' + `<main class="app"><header><span class="brand">ДЕКА 2</span><button id="libraryBtn" class="active">Треки</button><button id="syncBtn">Загрузить всё</button><button id="djBtn">DJ ⇠</button><button id="vkBtn">VK</button></header><div class="status" id="status">Читаю библиотеку…</div><section class="library"><div class="tools"><select data-source="main" id="sourcemain" aria-label="Источник"></select><input data-search="main" id="searchmain" type="search" placeholder="Название или исполнитель"><button id="fileBtn" title="Добавить свои аудиофайлы">＋ Файлы</button></div><div class="tools"><button id="saveBtn">Сохранить список</button><button id="currentBtn">Сейчас</button><button id="myBtn">Моя музыка VK</button><button id="cancelBtn" hidden>Стоп загрузки</button></div><div class="tools" id="setTools" hidden><input id="setUrl" type="url" placeholder="Ссылка на VK Видео"><button id="setAdd">Добавить сет</button></div><div class="count" id="countmain"></div><div id="listmain" aria-label="Все треки библиотеки"></div><div class="empty" id="empty" hidden>Откройте свою музыку в VK и нажмите «Загрузить всё». Сохраняется список названий, не аудиофайлы.</div></section><section class="dj" id="dj" aria-label="Две деки DJ"><div class="djinfo"><b>VK: один общий поток · Файлы: A + B</b><span id="djTotal"></span><input id="cross" type="range" min="-100" max="100" value="0" aria-label="Кроссфейдер A B"></div><div class="console">${sideHTML('A')}<section class="mixer" aria-label="Микшер"><label>MASTER<input id="master" type="range" min="0" max="100" value="80" aria-label="Master"></label><div class="pair"><label>A<input class="fader" data-gain="A" type="range" min="0" max="100" value="100" aria-label="Уровень A"></label><label>B<input class="fader" data-gain="B" type="range" min="0" max="100" value="100" aria-label="Уровень B"></label></div>${[0,1,2].map(function (band) { return `<label class="eq">${['LOW','MID','HIGH'][band]}<input data-eq="A" data-band="${band}" type="range" min="-12" max="12" value="0" aria-label="${['LOW','MID','HIGH'][band]} A"><input data-eq="B" data-band="${band}" type="range" min="-12" max="12" value="0" aria-label="${['LOW','MID','HIGH'][band]} B"></label>`; }).join('')}<button id="djFiles">＋ Файлы</button><button id="closeDj">К списку</button></section>${sideHTML('B')}</div></section><footer class="transport"><button id="mainPrev" aria-label="Предыдущий">|◀</button><div class="now"><b id="now">Выберите трек</b><small id="nowTime">Дека A</small></div><button id="mainPlay" class="play" aria-label="Играть пауза">▶</button><button id="mainNext" aria-label="Следующий">▶|</button><button id="backBtn" hidden>Дека 2</button></footer><div class="msg" id="message" hidden></div><input id="files" type="file" accept="audio/*" multiple hidden></main>`;
    $ = function (id) { return sh.getElementById(id); }; app = sh.querySelector('.app'); app.classList.toggle('desktop',!!window.DEKA_DESKTOP_SHELL);
    engine = window.DekaDecks.create({ vk: command, change: renderPlayback, message: message });
    ['main','A','B'].forEach(function (id) { lists[id] = new window.DekaVirtualList($('list' + id), function (data, index) { if (data[index].kind === 'set') { if(window.DEKA_DESKTOP_SHELL){DekaDesktop.openSet(data[index].url);}else location.assign(data[index].url); return; } var side = id === 'main' ? 'A' : id; engine.load(side, data, index); engine.play(side); }); });
    $('setAdd').onclick = function () {
      var u; try { u = new URL($('setUrl').value); } catch (_) { return message('Нужна полная ссылка https://vkvideo.ru/video…'); }
      var id = (u.pathname + u.search).match(/video(-?\d+_\d+)/);
      if (!/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(u.hostname) || !id) return message('Поддерживаются ссылки на видео VK');
      var url = 'https://vkvideo.ru/video' + id[1];
      if (!sets.some(function (s) { return s.url === url; })) sets.push({ url: url, title: 'Сет ' + (sets.length + 1), duration: 0 });
      try { localStorage.setItem('deka2:sets', JSON.stringify(sets)); } catch (_) { message('Сет не сохранён: хранилище заполнено'); }
      $('setUrl').value = ''; renderLists(false);
    };
    $('syncBtn').onclick = function () { window.DekaLibrary.collect(); };
    $('myBtn').onclick = function () { window.DekaLibrary.collectMy(); };
    $('cancelBtn').onclick = function () { window.DekaLibrary.cancel(); };
    $('djBtn').onclick = function () { setMode('dj'); rotationOpened = false; };
    $('libraryBtn').onclick = $('closeDj').onclick = function () { setMode('library'); rotationOpened = false; };
    $('fileBtn').onclick = $('djFiles').onclick = function () { $('files').click(); };
    $('mainPlay').onclick = function () { engine.toggle('A'); }; $('mainPrev').onclick = function () { engine.step('A', -1); }; $('mainNext').onclick = function () { engine.step('A', 1); };
    $('vkBtn').onclick = function () { vkView = true; app.classList.add('vkview'); $('backBtn').hidden = false; };
    $('backBtn').onclick = function () { vkView = false; app.classList.remove('vkview'); $('backBtn').hidden = true; };
    $('currentBtn').onclick = function () { var t = engine.state.A.track; if (!t || !lists.main.jump(t.key)) message('Текущего трека нет в выбранном списке'); };
    $('saveBtn').onclick = function () {
      var items = displayed('main').filter(function (t) { return t.kind !== 'file'; });
      if (!items.length) return message('Выберите непустой список VK. Файлы остаются на устройстве.');
      playlists.push({ id: 'p' + Date.now(), name: 'Плейлист ' + (playlists.length + 1), tracks: items });
      try { localStorage.setItem('deka2:playlists:v2:' + savedScope, JSON.stringify(playlists)); message('Сохранено ' + items.length + ' треков'); }
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
    var gesture = null;
    app.addEventListener('touchstart', function (e) { if (e.composedPath().some(function (el) { return el.tagName === 'INPUT' || el.tagName === 'SELECT'; })) { gesture = null; return; } var t = e.touches[0]; gesture = { x: t.clientX, y: t.clientY }; }, { passive: true });
    app.addEventListener('touchend', function (e) { if (!gesture) return; var t = e.changedTouches[0], dx = t.clientX - gesture.x, dy = t.clientY - gesture.y; gesture = null; if (Math.abs(dy) > 30 || Math.abs(dx) < 80) return; if (dx < 0) setMode('dj'); else setMode('library'); }, { passive: true });
    window.addEventListener('deka2:library', function (e) { library = e.detail; renderLibrary(); });
    window.addEventListener('deka2:vk:state', function (e) { media = e.detail || media; engine.noteVK(media); });
    window.addEventListener('deka2:vk:ended', function () { engine.endedVK(); });
    window.addEventListener('deka2:vk:fx', function (e) { if (e.detail && !e.detail.ok && mode === 'dj') message('Для этого потока VK эквалайзер недоступен. Для файлов обе деки работают независимо.'); });
    var landscape = matchMedia('(orientation: landscape)');
    function rotate() { if (vkView || window.DEKA_DESKTOP_SHELL) return; if (landscape.matches) { setMode('dj'); rotationOpened = true; } else if (rotationOpened) { setMode('library'); rotationOpened = false; } requestAnimationFrame(function () { Object.values(lists).forEach(function (v) { v.render(); }); }); }
    landscape.addEventListener('change', rotate);
    library = window.DekaLibrary.get(); renderLibrary(); rotate(); renderPlayback();
    window.addEventListener('pagehide', function () { engine.destroy(); urls.forEach(function (u) { URL.revokeObjectURL(u); }); }, { once: true });
  }
  function setMode(value) { mode = value; $('dj').classList.toggle('open', mode === 'dj'); app.classList.toggle('djmode', mode === 'dj'); $('djBtn').classList.toggle('active', mode === 'dj'); $('libraryBtn').classList.toggle('active', mode !== 'dj'); requestAnimationFrame(function () { Object.values(lists).forEach(function (v) { v.render(); }); }); }
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
    var items = source[id] === 'sets' ? sets.map(function (s) { return { key: s.url, title: s.title || 'Сет', artist: 'VK Видео', kind: 'set', url: s.url }; }) : source[id] === 'files' ? files : p ? p.tracks : ((library && library.items) || []);
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
      try { playlists = JSON.parse(localStorage.getItem('deka2:playlists:v2:' + savedScope)) || []; } catch (_) { playlists = []; }
      if (!Array.isArray(playlists)) playlists = [];
      // Preserve legacy playlists without silently treating an unscoped old cache as current VK data.
      try {
        if (!localStorage.getItem('deka2:migrated:v2:' + savedScope)) {
          var old = JSON.parse(localStorage.getItem('deka2:playlists')) || [];
          var all = JSON.parse(localStorage.getItem('deka2:myAll')) || [];
          if (Array.isArray(old)) old.forEach(function (p) { if (p && Array.isArray(p.tracks)) playlists.push({ id: 'legacy-' + p.id, name: (p.name || 'Плейлист') + ' · из 0.8', tracks: DekaLibraryCore.merge([], p.tracks) }); });
          if (Array.isArray(all) && all.length) playlists.push({ id: 'legacy-myall', name: 'Список из 0.8 · локальная копия', tracks: DekaLibraryCore.merge([], all) });
          localStorage.setItem('deka2:playlists:v2:' + savedScope, JSON.stringify(playlists));
          localStorage.setItem('deka2:migrated:v2:' + savedScope, '1');
        }
        sets = JSON.parse(localStorage.getItem('deka2:sets')) || [];
        if (!Array.isArray(sets)) sets = [];
        sets = sets.filter(function (s) { try { var u = new URL(s.url); return u.protocol === 'https:' && /(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(u.hostname); } catch (_) { return false; } });
      } catch (_) {}
      playlists = playlists.filter(function (p) { return p && p.id && typeof p.name === 'string' && Array.isArray(p.tracks); });
    }
    renderOptions(); renderLists(false);
    var l = library || {}, n = (l.items || []).length, expected = l.expected;
    var reason = { 'source-stalled':'Источник VK перестал догружать. Уже найденные треки сохранены; нажмите «Загрузить всё» для повтора.', 'waiting-personal-rows':'VK открывает строки полного списка…', 'connecting':'Подключение к VK…', 'opening-personal-list':'Открываю полный личный список…', 'personal-entry-not-found':'VK не показал переход к вашей музыке. Проверьте вход через кнопку VK.', 'personal-navigation-timeout':'Не удалось открыть личный раздел VK', 'source-not-ready':'Нет ответа от источника VK. Нажмите «Войти VK».', 'source-link-error':'Ошибка связи с VK', 'preview':'Первые личные треки доступны, догружаю продолжение', 'missing-tracks':'VK не отдал весь список', stalled:'Загрузка остановилась', 'source-changed':'Открыт другой список', cancelled:'Загрузка остановлена вами', 'no-rows':'На странице пока нет треков', limit:'Достигнут лимит прохода', 'read-error':'Ошибка чтения страницы', 'count-conflict':'Число треков не совпало', 'choose-library':'Откройте «Мои треки» в VK' };
    var status = l.status === 'loading' ? 'Загружаю: ' + (l.scanned || n) + (expected ? ' из ' + expected : '') + ' · список уже доступен' : l.complete ? (l.reason === 'count-matched' ? 'Загружено всё: ' + n + ' из ' + expected : 'Дошли до конца страницы · ' + n + ' треков') : 'Сохранено ' + n + (expected ? ' из ' + expected : '') + ' · ' + (reason[l.reason] || 'нажмите «Загрузить всё»');
    $('status').textContent = status; $('status').classList.toggle('error', l.status === 'partial');
    $('syncBtn').disabled = l.status === 'loading'; $('syncBtn').textContent = l.status === 'loading' ? 'Загрузка…' : 'Загрузить всё'; $('cancelBtn').hidden = l.status !== 'loading';
    $('djTotal').textContent = n + (expected ? '/' + expected : '') + ' треков · ' + (l.complete ? 'полный список' : l.status==='loading' ? 'догружаю' : 'неполная загрузка');
    if (l.storageError) message('Хранилище заполнено: этот список доступен только до закрытия приложения');
  }
  function renderPlayback() {
    if (!engine || !$) return;
    ['A','B'].forEach(function (side) {
      var s = engine.state[side], t = s.track;
      $('title' + side).textContent = t ? t.title : 'Выберите трек ниже';
      $('type' + side).textContent = t ? t.kind === 'file' ? 'Файл · независимая дека' : 'VK · общий поток' : (displayed(side).length ? 'Выберите трек' : 'Музыка ещё не загружена');
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
