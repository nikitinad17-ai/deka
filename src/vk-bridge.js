/*
 * Дека · мост к vk.ru
 * Встраивается в окно ВК до загрузки скриптов сайта. Ничего не скачивает и не трогает
 * логин: только читает то, что вы и так видите (трек, время, список), и нажимает
 * кнопки плеера ВК по командам из окна «Деки».
 */
(function () {
  "use strict";
  if (window.top !== window) return;
  if (!/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;
  // Страница VK Видео: здесь звук берём из <video> (вкладка «Сеты» на телефоне).
  function isVideoPage() { return /vkvideo\.ru$/.test(location.hostname) || /^\/(video|clip)/.test(location.pathname); }
  if (window.__deka) return;

  // ---------- связь с окном плеера ----------
  function emit(event, payload) {
    // Для плеера, встроенного прямо в страницу (версия для телефона), дублируем событие в DOM.
    try { window.dispatchEvent(new CustomEvent("deka:" + event, { detail: payload })); } catch (e) {}
    try {
      if (window.__TAURI__ && window.__TAURI__.event) return window.__TAURI__.event.emitTo("main", event, payload);
      if (window.__TAURI_INTERNALS__) return window.__TAURI_INTERNALS__.invoke("plugin:event|emit_to", {
        target: { kind: "AnyLabel", label: "main" }, event: event, payload: payload
      });
    } catch (e) { /* окно плеера ещё не готово */ }
  }

  // ---------- перехват медиа ----------
  // Плеер ВК создаёт <audio> в памяти, не всегда вставляя его в страницу,
  // поэтому запоминаем элемент в момент первого play().
  var media = null;
  var origPlay = HTMLMediaElement.prototype.play;
  function adopt(el) {
    media = el;
    if (!el.__dekaListen) {
      el.__dekaListen = true;
      // К моменту «playing» у элемента уже есть поток, и его можно подключить к эквалайзеру.
      el.addEventListener("playing", function () { hookFx(el); });
      el.addEventListener("ended", function () { if (el === media) emit("vk:ended", {}); });
    }
  }
  HTMLMediaElement.prototype.play = function () {
    if (this.tagName === "AUDIO" || (this.tagName === "VIDEO" && isVideoPage())) adopt(this);
    return origPlay.apply(this, arguments);
  };
  // Если ВК ещё не запускал звук, берём элемент со страницы сами.
  function findMedia() {
    if (media) return media;
    var el = document.querySelector(isVideoPage() ? "video" : "audio");
    if (el) adopt(el);
    return media;
  }
  function playMedia() {
    var m = findMedia();
    if (!m) return action("play");
    try { m.muted = false; } catch (e) {}
    var p = m.play(); if (p && p.catch) p.catch(function () {});
    return true;
  }

  // ВК регистрирует обработчики «следующий/предыдущий» для системных медиаклавиш.
  // Сохраняем их, чтобы вызывать те же действия из «Деки».
  var handlers = {};
  try {
    var ms = navigator.mediaSession;
    if (ms && ms.setActionHandler) {
      var origSet = ms.setActionHandler.bind(ms);
      ms.setActionHandler = function (action, fn) {
        handlers[action] = fn;
        return origSet(action, fn);
      };
    }
  } catch (e) {}

  function videoTitle() {
    var h = document.querySelector("h1, [data-testid*='video_title'], [class*='VideoTitle'], [class*='video_title']");
    var t = (h && h.textContent.trim()) || document.title || "";
    return t.replace(/\s*[|—-]\s*VK.*$/i, "").trim().slice(0, 140);
  }

  function nowPlaying() {
    var md = navigator.mediaSession && navigator.mediaSession.metadata;
    var art = md && md.artwork && md.artwork.length ? md.artwork[md.artwork.length - 1].src : "";
    return {
      title: md && md.title ? md.title : (isVideoPage() ? videoTitle() : ""),
      artist: md && md.artist ? md.artist : (isVideoPage() ? "VK Видео" : ""),
      video: isVideoPage(),
      album: md ? md.album : "",
      artwork: art,
      currentTime: media ? media.currentTime : 0,
      duration: media && isFinite(media.duration) ? media.duration : 0,
      paused: media ? media.paused : true,
      volume: media ? media.volume : 1,
      hasMedia: !!media,
      loggedIn: isLoggedIn()
    };
  }

  function isLoggedIn() {
    // Вошли ли вы: у гостя на странице есть кнопка «Войти», у вошедшего её нет.
    if (document.querySelector("[data-testid='left_menu_login_button']")) return false;
    var btns = document.querySelectorAll("a,button");
    for (var i = 0; i < btns.length && i < 400; i++) {
      var t = (btns[i].textContent || "").trim();
      if (t === "Войти" || t === "Sign in") return false;
    }
    return true;
  }

  // ---------- чтение плейлиста со страницы ----------
  // Разметка ВК меняется, поэтому здесь несколько стратегий. Первая, что нашла строки, побеждает.
  var ROW_SELECTORS = [
    "[data-audio]",                        // классическая разметка: JSON в data-audio
    "[data-testid='audio-row']",
    "[data-testid*='audio_row']",
    ".audio_row",
    ".audio_item",                         // мобильная версия m.vk
    "[class*='AudioRow__root']",
    "[class*='AudioRow']"
  ];
  var rowIndex = new Map(); // key -> element

  function textOf(el, sels) {
    for (var i = 0; i < sels.length; i++) {
      var n = el.querySelector(sels[i]);
      if (n && n.textContent.trim()) return n.textContent.trim();
    }
    return "";
  }
  function parseDur(s) {
    var m = String(s || "").match(/(\d+):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    return m[3] ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
  }

  // Раздел страницы, к которому относится строка: «Мои треки», название плейлиста,
  // «Новинки» и т. п. Поднимаемся от строки вверх до первого предка, внутри которого
  // есть заголовок (не внутри самой строки трека).
  var HEAD_SEL = "[data-testid*='BlockHeader'], [data-testid*='PlaylistHeader'], [data-testid*='playlist_header'], [data-testid='headerlayout'], h1, h2, h3, h4";
  var sectionCache = new WeakMap();
  function sectionOf(row) {
    if (sectionCache.has(row)) return sectionCache.get(row);
    var a = row.parentElement, depth = 0, name = "";
    while (a && a !== document.body && depth < 25) {
      var heads = a.querySelectorAll(HEAD_SEL), h = null;
      for (var i = 0; i < heads.length; i++) {
        if (!heads[i].closest("[data-testid='MusicTrackRow']")) { h = heads[i]; break; }
      }
      if (h) {
        name = (h.textContent || "").replace(/Показать все|Show all/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
        break;
      }
      a = a.parentElement; depth++;
    }
    name = name || "Без названия";
    sectionCache.set(row, name);
    return name;
  }

  function readRows() {
    rowIndex.clear();
    var list = [];

    // Текущая разметка vk.ru (проверено 27.09.2026): строка трека [data-testid=MusicTrackRow],
    // id трека у родителя в data-audio-id, кнопка запуска [data-testid=audiorow-tappable].
    var modern = document.querySelectorAll("[data-testid='MusicTrackRow']");
    if (modern.length) {
      var seen = {};
      Array.prototype.forEach.call(modern, function (row, i) {
        var q = function (id) { return row.querySelector("[data-testid='" + id + "']"); };
        var t = q("MusicTrackRow_Title"), a = q("MusicTrackRow_Authors"), d = q("MusicTrackRow_Duration");
        var title = t ? t.textContent.trim() : "";
        if (!title) return;
        var holder = row.closest("[data-audio-id]");
        var key = holder ? holder.getAttribute("data-audio-id") : "row" + i;
        if (seen[key]) key = key + "#" + i; // один трек может стоять в нескольких подборках
        seen[key] = 1;
        var tap = q("audiorow-tappable");
        var label = tap ? (tap.getAttribute("aria-label") || "") : "";
        var img = row.querySelector("[data-testid='MusicTrackRow_PlaybackControls'] img");
        rowIndex.set(key, row);
        list.push({
          key: key, section: sectionOf(row), title: title, artist: a ? a.textContent.trim() : "",
          duration: parseDur(d ? d.textContent : ""), cover: img ? img.src : "",
          current: !!label && label !== "Начать прослушивание"
        });
      });
      return list;
    }

    // Запасной вариант для старой разметки ВК.
    var rows = [];
    for (var s = 0; s < ROW_SELECTORS.length && !rows.length; s++) {
      rows = Array.prototype.slice.call(document.querySelectorAll(ROW_SELECTORS[s]));
      // отбрасываем вложенные совпадения
      rows = rows.filter(function (r) { return !rows.some(function (o) { return o !== r && o.contains(r); }); });
    }
    rows.forEach(function (row, i) {
      var title = "", artist = "", dur = 0, key = "";
      var raw = row.getAttribute("data-audio");
      if (raw) {
        try {
          var a = JSON.parse(raw);
          key = a[1] + "_" + a[0];
          title = a[3]; artist = a[4]; dur = +a[5] || 0;
        } catch (e) {}
      }
      if (!title) title = textOf(row, [".audio_row__title_inner", ".ai_title", "[class*='title'] a", "[class*='Title']", "[class*='title']"]);
      if (!artist) artist = textOf(row, [".audio_row__performers", ".ai_artist", "[class*='performer']", "[class*='Performer']", "[class*='artist']", "[class*='Artist']"]);
      if (!dur) dur = parseDur(textOf(row, [".audio_row__duration", ".ai_dur", "[class*='duration']", "[class*='Duration']"]) || row.textContent);
      if (!key) key = row.getAttribute("data-full-id") || row.getAttribute("data-id") || (artist + "—" + title + "#" + i);
      if (!title) return;
      rowIndex.set(key, row);
      list.push({
        key: key, section: sectionOf(row), title: decode(title), artist: decode(artist), duration: dur,
        current: /(_playing|_paused|--playing|--current|is-current|isCurrent)/i.test(row.className || "")
      });
    });
    return list;
  }
  function decode(s) { var t = document.createElement("textarea"); t.innerHTML = s || ""; return t.value; }

  var lastListJson = "";
  function sendList() {
    var list = readRows();
    var json = JSON.stringify(list);
    if (json !== lastListJson) {
      lastListJson = json;
      emit("vk:playlist", { page: location.pathname, items: list });
    }
  }
  var listTimer = null;
  function scheduleList() { clearTimeout(listTimer); listTimer = setTimeout(sendList, 400); }

  // ---------- команды из «Деки» ----------
  function clickRow(key) {
    var row = rowIndex.get(key);
    if (!row) { readRows(); row = rowIndex.get(key); }
    if (!row) return false;
    row.scrollIntoView({ block: "center" });
    var btn = row.querySelector("[data-testid='audiorow-tappable'], .audio_row__play_btn, .ai_play, .ai_body, [data-testid*='play'], [aria-label*='оспроизв'], [aria-label*='лушать'], button, [role='button']");
    (btn || row).click();
    return true;
  }
  // ---------- включить трек из очереди Деки ----------
  // Ключ трека: id ВК вида 123_456, иногда с хвостом «#n» (один трек в нескольких подборках).
  function baseKey(k) { return String(k || "").replace(/#\d+$/, ""); }
  function rowById(id) {
    var rows = document.querySelectorAll("[data-testid='MusicTrackRow']");
    for (var i = 0; i < rows.length; i++) {
      var h = rows[i].closest("[data-audio-id]");
      if (h && h.getAttribute("data-audio-id") === id) return rows[i];
    }
    return null;
  }
  function clickTrackRow(row) {
    row.scrollIntoView({ block: "center" });
    var btn = row.querySelector("[data-testid='audiorow-tappable']") || row;
    btn.click();
  }
  // Ищем трек на текущей странице, листая её сверху вниз (длинный список ВК
  // подгружает кусками). Не нашли — сообщаем «Деке», она перейдёт к следующему.
  // Чужой трек вместо пропавшего никогда не включаем.
  var finding = 0;
  function findAndPlay(id) {
    var my = ++finding, rounds = 0, idle = 0, lastSig = "";
    try { window.scrollTo(0, 0); } catch (e) {}
    (function look() {
      if (my !== finding) return; // пришла новая команда
      var row = rowById(id);
      if (row) { clickTrackRow(row); return; }
      var rows = document.querySelectorAll("[data-testid='MusicTrackRow']");
      var last = rows[rows.length - 1];
      var h = last && last.closest("[data-audio-id]");
      var sig = rows.length + "|" + (h ? h.getAttribute("data-audio-id") : "");
      // Пока страница не загрузилась (строк нет), ждём до ~20 секунд; потом 6 пустых прокруток = конец списка.
      if (rows.length) { idle = sig === lastSig ? idle + 1 : 0; lastSig = sig; } else if (rounds > 40) idle = 99;
      if (idle >= 6 || ++rounds > 600) { emit("vk:linkfail", { id: id, queue: true }); return; }
      if (last) { try { last.scrollIntoView({ block: "start" }); } catch (e) {} }
      else { var se = document.scrollingElement || document.documentElement; window.scrollTo(0, se.scrollHeight); }
      setTimeout(look, rows.length ? 600 : 500);
    })();
  }
  function playKey(key) {
    var row = rowIndex.get(key);
    if (!row) { readRows(); row = rowIndex.get(key); }
    var id = baseKey(key);
    if (!row && /^-?\d+_\d+$/.test(id)) row = rowById(id);
    if (row) { finding++; clickTrackRow(row); return; }
    if (!/^-?\d+_\d+$/.test(id)) { emit("vk:linkfail", { id: id, queue: true }); return; }
    // На странице «Мои треки» ищем прокруткой; иначе переходим туда и ищем после загрузки.
    if (/\/audios/.test(location.pathname)) { findAndPlay(id); return; }
    try { sessionStorage.setItem("dekaFind", id); } catch (e) {}
    openMy();
  }
  function findFromQueue() {
    var id = null;
    try { id = sessionStorage.getItem("dekaFind"); sessionStorage.removeItem("dekaFind"); } catch (e) {}
    if (id) findAndPlay(id);
  }

  function action(name) {
    if (handlers[name]) { try { handlers[name]({ action: name }); return true; } catch (e) {} }
    return false;
  }

  // ---------- эквалайзер и спектр для звука ВК ----------
  // Звук ВК пропускается через ту же цепочку, что и в плеере: предусилитель,
  // 10 полос, баланс, анализатор. Подключаем только потоки blob: (так ВК отдаёт
  // музыку через MSE): прямые ссылки на чужой сервер браузер отдал бы в цепочку
  // тишиной, и звук пропал бы.
  var FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
  var fxSet = { on: true, pre: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bal: 0, filter: 0 };
  var fx = null;              // общий граф
  var hooked = new WeakSet(); // элементы, уже подключённые к графу
  var fxState = null;

  function buildFx() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var ctx = new Ctx();
    var input = ctx.createGain();
    var pre = ctx.createGain();
    var filters = FREQS.map(function (f, i) {
      var b = ctx.createBiquadFilter();
      b.type = i === 0 ? "lowshelf" : (i === FREQS.length - 1 ? "highshelf" : "peaking");
      b.frequency.value = f; b.Q.value = 1.1; return b;
    });
    var djFilter = ctx.createBiquadFilter();
    djFilter.type = "allpass";
    djFilter.frequency.value = 20000;
    djFilter.Q.value = 0.7;
    var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    var an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.7;
    var n = input; n.connect(pre); n = pre;
    filters.forEach(function (f) { n.connect(f); n = f; });
    n.connect(djFilter); djFilter.connect(pan); pan.connect(an); an.connect(ctx.destination);
    fx = { ctx: ctx, input: input, pre: pre, filters: filters, djFilter: djFilter, pan: pan, an: an, data: new Uint8Array(an.frequencyBinCount) };
    applyFx();
    setInterval(sendSpectrum, 40);
  }

  function applyFx() {
    if (!fx) return;
    var t = fx.ctx.currentTime;
    fx.filters.forEach(function (f, i) { f.gain.setTargetAtTime(fxSet.on ? (+fxSet.gains[i] || 0) : 0, t, 0.02); });
    fx.pre.gain.setTargetAtTime(fxSet.on ? Math.pow(10, (+fxSet.pre || 0) / 20) : 1, t, 0.02);
    var cut = Math.max(-1, Math.min(1, +fxSet.filter || 0));
    if (!fxSet.on || Math.abs(cut) < 0.025) {
      fx.djFilter.type = "allpass";
      fx.djFilter.frequency.setTargetAtTime(20000, t, 0.02);
    } else if (cut < 0) {
      fx.djFilter.type = "lowpass";
      fx.djFilter.frequency.setTargetAtTime(18000 * Math.pow(160 / 18000, -cut), t, 0.025);
      fx.djFilter.Q.setTargetAtTime(0.85, t, 0.025);
    } else {
      fx.djFilter.type = "highpass";
      fx.djFilter.frequency.setTargetAtTime(30 * Math.pow(8000 / 30, cut), t, 0.025);
      fx.djFilter.Q.setTargetAtTime(0.85, t, 0.025);
    }
    if (fx.pan.pan) fx.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, +fxSet.bal || 0)), t, 0.02);
  }

  function hookFx(el) {
    if (!el || hooked.has(el)) return report(!!fx);
    var src = el.currentSrc || el.src || "";
    if (src.indexOf("blob:") !== 0) return report(false);
    try {
      if (!fx) buildFx();
      var node = fx.ctx.createMediaElementSource(el);
      node.connect(fx.input);
      hooked.add(el);
      if (fx.ctx.state === "suspended") fx.ctx.resume();
      report(true);
    } catch (e) { report(false); }
  }
  function report(ok) {
    if (fxState === ok) return;
    fxState = ok;
    emit("vk:fx", { ok: ok });
  }

  function sendSpectrum() {
    if (!fx || !media || media.paused || !hooked.has(media)) return;
    if (fx.ctx.state === "suspended") fx.ctx.resume();
    fx.an.getByteFrequencyData(fx.data);
    var N = 40, out = [], nyq = fx.ctx.sampleRate / 2, L = fx.data.length;
    for (var i = 0; i < N; i++) {
      var f0 = 40 * Math.pow(16000 / 40, i / N), f1 = 40 * Math.pow(16000 / 40, (i + 1) / N);
      var a = Math.floor(f0 / nyq * L), b = Math.max(a + 1, Math.floor(f1 / nyq * L)), v = 0;
      for (var k = a; k < b; k++) v = Math.max(v, fx.data[k]);
      out.push(v);
    }
    emit("vk:spectrum", out);
  }

  // ---------- сбор всего списка для экспорта ----------
  // ВК подгружает длинные списки при прокрутке и может убирать строки, ушедшие
  // из вида, поэтому листаем вниз и копим треки, пока новые не перестанут появляться.
  // Прокрутка к концу списка. Мобильный ВК может прокручивать не окно, а свой блок,
  // поэтому дополнительно прокручиваем к последней строке трека.
  function trackScrollHost() {
    var row = document.querySelector("[data-testid='MusicTrackRow'], .audio_item, .audio_row, [data-audio]");
    var p = row && row.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      try {
        var s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY || "") && p.scrollHeight > p.clientHeight + 40) return p;
      } catch (e) {}
      p = p.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function hostPos(host) {
    return host === document.scrollingElement || host === document.documentElement || host === document.body ? window.scrollY : host.scrollTop;
  }
  function hostAtEnd(host) {
    if (!host) return true;
    if (host === document.scrollingElement || host === document.documentElement || host === document.body) {
      var se = document.scrollingElement || document.documentElement;
      return window.scrollY + window.innerHeight >= se.scrollHeight - 48;
    }
    return host.scrollTop + host.clientHeight >= host.scrollHeight - 48;
  }
  function scrollToEnd() {
    var host = trackScrollHost();
    if (host === document.scrollingElement || host === document.documentElement || host === document.body) {
      var se = document.scrollingElement || document.documentElement;
      window.scrollTo(0, se.scrollHeight);
    } else {
      host.scrollTop = host.scrollHeight;
    }
    var rows = document.querySelectorAll("[data-testid='MusicTrackRow'], .audio_item, .audio_row, [data-audio]");
    if (rows.length) { try { rows[rows.length - 1].scrollIntoView({ block: "end" }); } catch (e) {} }
  }
  // Шаг примерно на 80% экрана/скролл-контейнера. VK на Android иногда
  // виртуализирует строки внутри собственного блока, поэтому window.scrollY
  // недостаточно: двигаем реальный прокручиваемый родитель списка.
  function scrollStep() {
    var host = trackScrollHost();
    var rows = document.querySelectorAll("[data-testid='MusicTrackRow'], .audio_item, .audio_row, [data-audio]");
    var before = hostPos(host);
    var amount = Math.max(260, Math.floor(((host && host.clientHeight) || window.innerHeight || 600) * 0.8));
    if (host === document.scrollingElement || host === document.documentElement || host === document.body) window.scrollBy(0, amount);
    else host.scrollTop = Math.min(host.scrollHeight, host.scrollTop + amount);
    if (rows.length) { try { rows[rows.length - 1].scrollIntoView({ block: "end" }); } catch (e) {} }
    return { moved: hostPos(host) !== before, atEnd: hostAtEnd(host) };
  }

  var collecting = false;
  function collectAll() {
    if (collecting) return;
    collecting = true;
    finding++; // поиск трека для очереди прерываем, чтобы не мешал прокрутке
    var acc = new Map(), idle = 0, rounds = 0, startHost = trackScrollHost(), startY = hostPos(startHost);
    try {
      if (startHost === document.scrollingElement || startHost === document.documentElement || startHost === document.body) window.scrollTo(0, 0);
      else startHost.scrollTop = 0;
    } catch (e) {}
    function keyOf(t) {
      var k = String(t.key);
      var base = /^row\d+$/.test(k) ? t.artist + "—" + t.title : k.replace(/#\d+$/, "");
      // На /audios один и тот же трек может временно оказаться в нескольких виртуальных блоках.
      // Для полного «Моего списка» дедуплицируем по id/названию, а не по заголовку блока.
      return (/\/audios/.test(location.pathname) ? "" : (t.section || "") + "|") + base;
    }
    function step() {
      var added = 0;
      readRows().forEach(function (t) {
        var k = keyOf(t);
        if (!acc.has(k)) { acc.set(k, { key: String(t.key).replace(/#\d+$/, ""), section: t.section || "", title: t.title, artist: t.artist, duration: t.duration }); added++; }
      });
      rounds++;
      // Страница ещё грузится: ждём строки до ~25 секунд, это не конец списка.
      if (!acc.size && rounds < 25) { setTimeout(step, 1000); return; }
      idle = added ? 0 : idle + 1;
      var progress = scrollStep();
      // Заканчиваем, только когда некоторое время нет новых треков И мы реально
      // дошли до низа скролл-контейнера. Это важно для длинных виртуальных списков VK.
      if ((idle >= 12 && progress.atEnd) || idle >= 24 || rounds > 2000 || acc.size >= 15000) {
        collecting = false;
        try {
          if (startHost === document.scrollingElement || startHost === document.documentElement || startHost === document.body) window.scrollTo(0, startY);
          else startHost.scrollTop = startY;
        } catch (e) {}
        emit("vk:collect", { done: true, count: acc.size, page: location.pathname, items: Array.from(acc.values()) });
        return;
      }
      emit("vk:collect", { done: false, count: acc.size });
      // Иногда VK ждёт повторного появления нижней границы в viewport.
      if (idle === 6 || idle === 12 || idle === 18) {
        var h = trackScrollHost();
        try {
          if (h === document.scrollingElement || h === document.documentElement || h === document.body) window.scrollBy(0, -600);
          else h.scrollTop = Math.max(0, h.scrollTop - 600);
        } catch (e) {}
        setTimeout(function () { scrollStep(); setTimeout(step, 1400); }, 450);
        return;
      }
      setTimeout(step, progress.moved ? 850 : 1200);
    }
    setTimeout(step, 800); // даём ВК отрисовать начало списка после прокрутки наверх
  }
  // «Весь список»: открыть «Мои треки» (если ещё не там) и собрать их целиком.
  function collectMy() {
    if (/\/audios/.test(location.pathname)) { collectAll(); return; }
    try { sessionStorage.setItem("dekaCollect", "1"); } catch (e) {}
    openMy();
  }
  function collectFromFlag() {
    var on = null;
    try { on = sessionStorage.getItem("dekaCollect"); sessionStorage.removeItem("dekaCollect"); } catch (e) {}
    if (on) collectAll();
  }

  // Свой id ВК: из глобальных данных страницы или из ссылки на свой профиль.
  function myId() {
    try {
      var v = window.vk || {};
      var id = v.id || v.uid || (v.user && v.user.id);
      if (id) return id;
    } catch (e) {}
    var m = document.cookie.match(/(?:^|;\s*)remixmid=(\d+)/);
    return m ? m[1] : "";
  }

  // Открыть полный список «Мои треки» (там на странице только ваши треки).
  function openMy() {
    // Мобильный ВК пишет полный адрес (https://m.vk.ru/audios…), компьютерный — короткий.
    var a = document.querySelector("a[href*='/audios']");
    if (!a) {
      var links = document.querySelectorAll("a[href]");
      for (var i = 0; i < links.length && !a; i++) {
        var txt = (links[i].textContent || "").trim();
        if (/^(Мои треки|Показать все|My tracks|Show all)$/i.test(txt) && /audio/.test(links[i].getAttribute("href"))) a = links[i];
      }
    }
    if (a) { location.href = a.getAttribute("href"); return; }
    var id = myId();
    location.href = id ? "/audios" + id : "/audio";
  }

  // Что мост видит на странице: для подстройки под новую вёрстку ВК по скриншоту.
  function diag() {
    function n(sel) { try { return document.querySelectorAll(sel).length; } catch (e) { return -1; } }
    var tids = {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-testid]"), function (e) {
      var t = e.getAttribute("data-testid"); if (/audio|music|track|playlist/i.test(t)) tids[t] = (tids[t] || 0) + 1;
    });
    var cls = {};
    Array.prototype.forEach.call(document.querySelectorAll("[class*='audio'],[class*='Audio'],[class*='track'],[class*='Track']"), function (e) {
      var c = String(e.className).split(/\s+/)[0]; if (c) cls[c] = (cls[c] || 0) + 1;
    });
    return {
      url: location.href.slice(0, 120), rows: readRows().length,
      MusicTrackRow: n("[data-testid='MusicTrackRow']"), dataAudio: n("[data-audio]"), audioId: n("[data-audio-id]"),
      audioItem: n(".audio_item"), audioRow: n(".audio_row"), media: !!media, loggedIn: isLoggedIn(), myId: myId(),
      audioLinks: Array.prototype.slice.call(document.querySelectorAll("a[href*='audio']"), 0, 10).map(function (a) {
        return (a.textContent || "").trim().slice(0, 24) + " → " + a.getAttribute("href").slice(0, 60);
      }),
      testids: Object.keys(tids).slice(0, 12).map(function (k) { return k + "×" + tids[k]; }),
      classes: Object.keys(cls).slice(0, 12).map(function (k) { return k + "×" + cls[k]; })
    };
  }

  window.__deka = {
    cmd: function (c) {
      c = c || {};
      switch (c.type) {
        case "toggle": if (media && !media.paused) media.pause(); else playMedia(); break;
        case "play": playMedia(); break;
        case "skip": if (media && isFinite(c.by)) media.currentTime = Math.max(0, media.currentTime + c.by); break;
        case "openMy": openMy(); break;
        case "pause": if (media) media.pause(); break;
        case "stop": if (media) { media.pause(); media.currentTime = 0; } break;
        case "next": action("nexttrack"); break;
        case "prev":
          if (media && media.currentTime > 3) media.currentTime = 0; else action("previoustrack");
          break;
        case "seek": if (media && isFinite(c.time)) media.currentTime = c.time; break;
        case "volume": if (media && isFinite(c.value)) media.volume = Math.max(0, Math.min(1, c.value)); break;
        case "playRow": clickRow(c.key); break;
        case "playKey": playKey(c.key); break;
        case "open": if (c.path && c.path.charAt(0) === "/") location.href = c.path; break;
        case "openPlay":
          // Открыть трек по ссылке и включить его, когда страница загрузится.
          if (c.path && c.path.charAt(0) === "/") {
            try { sessionStorage.setItem("dekaAutoplay", c.id || "*"); } catch (e) {}
            location.href = c.path;
          }
          break;
        case "refresh": lastListJson = ""; sendList(); break;
        case "collectAll": collectAll(); break;
        case "collectMy": collectMy(); break;
        case "more":
          // Подгрузить ещё треки: ВК догружает список при прокрутке вниз.
          scrollToEnd();
          setTimeout(function () { lastListJson = ""; sendList(); }, 1200);
          break;
        case "diag": emit("vk:diag", diag()); break;
        case "fx":
          if (typeof c.on === "boolean") fxSet.on = c.on;
          if (isFinite(c.pre)) fxSet.pre = +c.pre;
          if (Array.isArray(c.gains) && c.gains.length === FREQS.length) fxSet.gains = c.gains.map(Number);
          if (isFinite(c.bal)) fxSet.bal = +c.bal;
          if (isFinite(c.filter)) fxSet.filter = Math.max(-1, Math.min(1, +c.filter));
          applyFx();
          if (media && !media.paused) hookFx(media);
          break;
      }
      setTimeout(tick, 60);
    },
    // Для отладки: посмотреть, что мост видит на странице.
    debug: function () { var r = readRows(); return { np: nowPlaying(), rows: r.length, sample: r.slice(0, 3) }; }
  };

  // ---------- циклы ----------
  var lastStateJson = "";
  function tick() {
    var s = nowPlaying();
    var j = JSON.stringify(s);
    if (j !== lastStateJson) { lastStateJson = j; emit("vk:state", s); }
  }
  setInterval(tick, 500);

  // Сторож: если трек «играет», но время не идёт, пробуем перезапустить его один раз,
  // а потом просим «Деку» предложить перезапуск ВК.
  var stallT = -1, stallFor = 0, retried = false, stallSrc = "";
  setInterval(function () {
    if (!media || media.paused || media.ended) { stallFor = 0; retried = false; return; }
    var src = media.currentSrc || media.src || "";
    if (src !== stallSrc) { stallSrc = src; stallFor = 0; retried = false; }
    if (media.currentTime !== stallT) { stallT = media.currentTime; stallFor = 0; return; }
    stallFor++;
    if (stallFor === 8 && !retried) {
      retried = true;
      emit("vk:stall", { retried: false });
      try { media.pause(); setTimeout(function () { media.play(); }, 300); } catch (e) {}
    } else if (stallFor === 20) {
      emit("vk:stall", { retried: true });
    }
  }, 1000);

  function autoplayFromLink() {
    var want = null;
    try { want = sessionStorage.getItem("dekaAutoplay"); sessionStorage.removeItem("dekaAutoplay"); } catch (e) {}
    if (!want) return;
    var tries = 0;
    (function look() {
      var rows = document.querySelectorAll("[data-testid='MusicTrackRow']");
      var target = null;
      for (var i = 0; i < rows.length && !target; i++) {
        var h = rows[i].closest("[data-audio-id]");
        if (h && h.getAttribute("data-audio-id") === want) target = rows[i];
      }
      if (!target && rows.length && tries > 6) target = rows[0]; // id не нашёлся: берём первый трек страницы
      if (target) {
        var btn = target.querySelector("[data-testid='audiorow-tappable']") || target;
        btn.click();
        return;
      }
      if (++tries < 30) setTimeout(look, 500);
      else emit("vk:linkfail", { id: want });
    })();
  }

  // На странице сета видео запускаем сами, как только плеер появится.
  function autoplayVideo() {
    if (!isVideoPage()) return;
    var tries = 0;
    (function look() {
      var v = document.querySelector("video");
      if (v && v.paused) { adopt(v); playMedia(); }
      if ((!v || v.paused) && ++tries < 40) setTimeout(look, 500);
    })();
  }

  function startObserver() {
    if (!document.body) return setTimeout(startObserver, 200);
    autoplayVideo();
    autoplayFromLink();
    findFromQueue();
    collectFromFlag();
    new MutationObserver(scheduleList).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    scheduleList();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
  else startObserver();
})();
