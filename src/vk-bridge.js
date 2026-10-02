/*
 * Дека · мост к vk.ru
 * Встраивается в окно ВК до загрузки скриптов сайта. Ничего не скачивает и не трогает
 * логин: только читает то, что вы и так видите (трек, время, список), и нажимает
 * кнопки плеера ВК по командам из окна «Деки».
 */
(function () {
  "use strict";
  if (window.top !== window) return;
  if (!/(^|\.)vk\.(ru|com)$/.test(location.hostname)) return;
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
  HTMLMediaElement.prototype.play = function () {
    if (this instanceof HTMLAudioElement || this.tagName === "AUDIO") {
      media = this;
      if (!this.__dekaListen) {
        this.__dekaListen = true;
        var el = this;
        // К моменту «playing» у элемента уже есть поток, и его можно подключить к эквалайзеру.
        el.addEventListener("playing", function () { hookFx(el); });
      }
    }
    return origPlay.apply(this, arguments);
  };

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

  function nowPlaying() {
    var md = navigator.mediaSession && navigator.mediaSession.metadata;
    var art = md && md.artwork && md.artwork.length ? md.artwork[md.artwork.length - 1].src : "";
    return {
      title: md ? md.title : "",
      artist: md ? md.artist : "",
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
      if (!title) title = textOf(row, [".audio_row__title_inner", "[class*='title'] a", "[class*='Title']", "[class*='title']"]);
      if (!artist) artist = textOf(row, [".audio_row__performers", "[class*='performer']", "[class*='Performer']", "[class*='artist']", "[class*='Artist']"]);
      if (!dur) dur = parseDur(textOf(row, [".audio_row__duration", "[class*='duration']", "[class*='Duration']"]) || row.textContent);
      if (!key) key = row.getAttribute("data-full-id") || row.getAttribute("data-id") || (artist + "—" + title + "#" + i);
      if (!title) return;
      rowIndex.set(key, row);
      list.push({
        key: key, title: decode(title), artist: decode(artist), duration: dur,
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
    var btn = row.querySelector("[data-testid='audiorow-tappable'], .audio_row__play_btn, [data-testid*='play'], [aria-label*='оспроизв'], [aria-label*='лушать'], button, [role='button']");
    (btn || row).click();
    return true;
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
  var fxSet = { on: true, pre: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bal: 0 };
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
    var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    var an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.7;
    var n = input; n.connect(pre); n = pre;
    filters.forEach(function (f) { n.connect(f); n = f; });
    n.connect(pan); pan.connect(an); an.connect(ctx.destination);
    fx = { ctx: ctx, input: input, pre: pre, filters: filters, pan: pan, an: an, data: new Uint8Array(an.frequencyBinCount) };
    applyFx();
    setInterval(sendSpectrum, 40);
  }

  function applyFx() {
    if (!fx) return;
    var t = fx.ctx.currentTime;
    fx.filters.forEach(function (f, i) { f.gain.setTargetAtTime(fxSet.on ? (+fxSet.gains[i] || 0) : 0, t, 0.02); });
    fx.pre.gain.setTargetAtTime(fxSet.on ? Math.pow(10, (+fxSet.pre || 0) / 20) : 1, t, 0.02);
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
  var collecting = false;
  function collectAll() {
    if (collecting) return;
    collecting = true;
    var acc = new Map(), idle = 0, rounds = 0, startY = window.scrollY;
    function keyOf(t) {
      var k = String(t.key);
      var base = /^row\d+$/.test(k) ? t.artist + "—" + t.title : k.replace(/#\d+$/, "");
      return (t.section || "") + "|" + base;
    }
    function step() {
      var added = 0;
      readRows().forEach(function (t) {
        var k = keyOf(t);
        if (!acc.has(k)) { acc.set(k, { key: String(t.key).replace(/#\d+$/, ""), section: t.section || "", title: t.title, artist: t.artist, duration: t.duration }); added++; }
      });
      rounds++;
      idle = added ? 0 : idle + 1;
      if (idle >= 5 || rounds > 400 || acc.size >= 5000) {
        collecting = false;
        window.scrollTo(0, startY);
        emit("vk:collect", { done: true, count: acc.size, page: location.pathname, items: Array.from(acc.values()) });
        return;
      }
      emit("vk:collect", { done: false, count: acc.size });
      var se = document.scrollingElement || document.documentElement;
      window.scrollTo(0, se.scrollHeight);
      setTimeout(step, 900);
    }
    step();
  }

  window.__deka = {
    cmd: function (c) {
      c = c || {};
      switch (c.type) {
        case "toggle": if (media) { media.paused ? media.play() : media.pause(); } else action("play"); break;
        case "play": media ? media.play() : action("play"); break;
        case "pause": if (media) media.pause(); break;
        case "stop": if (media) { media.pause(); media.currentTime = 0; } break;
        case "next": action("nexttrack"); break;
        case "prev":
          if (media && media.currentTime > 3) media.currentTime = 0; else action("previoustrack");
          break;
        case "seek": if (media && isFinite(c.time)) media.currentTime = c.time; break;
        case "volume": if (media && isFinite(c.value)) media.volume = Math.max(0, Math.min(1, c.value)); break;
        case "playRow": clickRow(c.key); break;
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
        case "fx":
          if (typeof c.on === "boolean") fxSet.on = c.on;
          if (isFinite(c.pre)) fxSet.pre = +c.pre;
          if (Array.isArray(c.gains) && c.gains.length === FREQS.length) fxSet.gains = c.gains.map(Number);
          if (isFinite(c.bal)) fxSet.bal = +c.bal;
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

  function startObserver() {
    if (!document.body) return setTimeout(startObserver, 200);
    autoplayFromLink();
    new MutationObserver(scheduleList).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    scheduleList();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
  else startObserver();
})();
