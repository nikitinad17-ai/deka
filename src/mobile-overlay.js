/*
 * Дека · интерфейс поверх ВК (версия для телефона)
 * На Android у приложения одно окно: в нём открыт сайт ВК, а Дека закрывает его
 * своим интерфейсом на весь экран. Сам сайт показывается только по кнопке «ВК»
 * (вход в аккаунт, поиск), тогда от Деки остаётся полоска снизу.
 *
 * Вкладки: «Музыка» (треки со страницы ВК), «Плейлисты» (свои плейлисты Деки),
 * «Сеты» (видео из VK Видео играет как аудио, с эквалайзером; ничего не сохраняется).
 * Переключение треков идёт по собственной очереди Деки, а не по очереди ВК.
 */
(function () {
  "use strict";
  if (window.top !== window) return;
  if (!/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;
  if (window.__dekaOverlay) return;
  window.__dekaOverlay = true;

  var APP_URL = "http://tauri.localhost/index.html"; // своя страница приложения (файлы)
  var MUSIC_URL = "https://vk.ru/audio";
  var IS_VIDEO = /vkvideo\.ru$/.test(location.hostname) || /^\/(video|clip)/.test(location.pathname);
  var FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
  var PRESETS = {
    flat: ["Ровно", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    bass: ["Больше баса", [7, 6, 4, 1, 0, -1, -1, 0, 0, 0]],
    rock: ["Рок", [5, 3, -2, -4, -1, 2, 5, 6, 6, 6]],
    vocal: ["Вокал", [-2, -3, -1, 2, 5, 5, 3, 1, 0, -1]],
    pop: ["Поп", [-1, 2, 4, 5, 3, 0, -1, -1, -1, -1]],
    club: ["Клуб", [0, 0, 3, 4, 4, 4, 2, 0, 0, 0]]
  };
  var ALL = "__all__";
  var MYALL = "★ Весь мой список";

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("deka:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("deka:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  // Данные со страницы музыки, переданные в адресе при переходе на сет (у VK Видео своё хранилище).
  var handoff = readHash("deka");
  if (handoff && handoff.fx) { store.set("fx", handoff.fx); store.set("preset", handoff.preset || "custom"); }
  // Название сета, которое страница сета передала обратно на страницу музыки.
  var setBack = readHash("deka-set");

  var fx = store.get("fx", { on: true, pre: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bal: 0 });
  var preset = store.get("preset", "flat");
  var section = store.get("mSection", "");
  var tab = store.get("tab", "music");                 // music | playlists | sets
  var view = IS_VIDEO ? "deka" : store.get("view", "deka"); // deka — весь экран, vk — полоска снизу
  var playlists = store.get("playlists", []);          // [{id, name, tracks:[{key,title,artist,duration}]}]
  var sets = store.get("sets", []);                    // [{url, title, duration}]
  var myAll = store.get("myAll", []);                  // весь плейлист, собранный прокруткой
  var queue = store.get("queue", null);                // {list:[...], index}
  if (!queue || !Array.isArray(queue.list) || !queue.list.length) queue = null;
  else { queue.index = Math.max(0, Math.min(queue.list.length - 1, isFinite(+queue.index) ? +queue.index : 0)); }
  var openPl = null;                                   // открытый плейлист во вкладке «Плейлисты»
  var selecting = null;                                // режим создания плейлиста: {keys:{}}
  var st = { paused: true, currentTime: 0, duration: 0, title: "", artist: "", loggedIn: true };
  var stAt = 0, spec = null, items = [], eqOpen = false;
  // Сбор «Весь список» переживает переход на страницу «Мои треки» (страница перезагружается).
  var collecting = Date.now() - store.get("collectingAt", 0) < 120000;

  if (setBack && setBack.url) {
    sets.forEach(function (s) { if (s.url === setBack.url) { if (setBack.title) s.title = setBack.title; if (setBack.duration) s.duration = setBack.duration; } });
    store.set("sets", sets);
    tab = "sets";
  }

  function readHash(name) {
    var m = location.hash.match(new RegExp("[#&]" + name + "=([^&]*)"));
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }
  function cmd(c) { if (window.__deka) window.__deka.cmd(c); }
  var fxTimer = null;
  function sendFx() {
    store.set("fx", fx);
    clearTimeout(fxTimer);
    fxTimer = setTimeout(function () { cmd({ type: "fx", on: fx.on, pre: fx.pre, gains: fx.gains, bal: fx.bal }); }, 60);
  }
  function now() { return st.paused ? st.currentTime : Math.min(st.duration || Infinity, st.currentTime + (performance.now() - stAt) / 1000); }
  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = String(s % 60).padStart(2, "0");
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + x : String(m).padStart(2, "0") + ":" + x;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plural(n, f) { return f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2]; }
  function tracksWord(n) { return n + " " + plural(n, ["трек", "трека", "треков"]); }

  // ---------- очередь Деки ----------
  function same(a, b) { return a && b && a.title === b.title && (a.artist || "") === (b.artist || ""); }
  function playTrack(t) {
    if (!t) return;
    if (same(t, st) && !st.paused) return;            // уже играет: клик по строке ВК поставил бы паузу
    setState("ЗАГРУЗКА");
    // Мост сам найдёт трек: на странице, прокруткой в «Моих треках» или сообщит, что не нашёл.
    cmd({ type: "playKey", key: t.key });
  }
  function startQueue(list, index) {
    list = Array.isArray(list) ? list.filter(function (t) { return t && t.key; }) : [];
    if (!list.length) { setState("ПУСТО"); return; }
    index = Math.max(0, Math.min(list.length - 1, isFinite(+index) ? +index : 0));
    queue = { list: list.map(function (t) { return { key: t.key, title: t.title, artist: t.artist, duration: t.duration }; }), index: index };
    store.set("queue", queue);
    playTrack(queue.list[index]);
  }
  function step(d) {
    if (!queue || !Array.isArray(queue.list) || !queue.list.length) { cmd({ type: d > 0 ? "next" : "prev" }); return; }
    if (!isFinite(+queue.index) || queue.index < 0 || queue.index >= queue.list.length) queue.index = 0;
    if (d < 0 && now() > 3) { cmd({ type: "seek", time: 0 }); return; }
    queue.index = (queue.index + d + queue.list.length) % queue.list.length;
    store.set("queue", queue);
    playTrack(queue.list[queue.index]);
  }
  function syncQueueIndex() {
    if (!queue || !st.title) return;
    for (var i = 0; i < queue.list.length; i++) {
      if (same(queue.list[i], st)) { if (queue.index !== i) { queue.index = i; store.set("queue", queue); } return; }
    }
  }

  // ---------- оформление ----------
  var CSS = [
    ":host{all:initial}", "*{box-sizing:border-box}",
    ".root{--desk:#101216;--chassis:#1b1e24;--hi:#262a32;--edge:#353a44;--lcd:#0a100d;--lcd-edge:#1d2a23;--amber:#ffb347;--amber-dim:#6b4a1d;--cyan:#72d6e8;--ink:#d6dae2;--ink2:#8d94a3;",
    "position:fixed;z-index:2147483647;color:var(--ink);font:14px/1.3 system-ui,-apple-system,Roboto,sans-serif;-webkit-tap-highlight-color:transparent}",
    ".root.full{inset:0;background:radial-gradient(900px 400px at 20% -10%,#1c2029 0%,transparent 60%),var(--desk);display:flex;flex-direction:column;",
    "padding:calc(8px + env(safe-area-inset-top,0px)) 12px calc(8px + env(safe-area-inset-bottom,0px))}",
    ".root.mini{left:0;right:0;bottom:0;background:linear-gradient(180deg,var(--hi),var(--chassis) 52px);border-top:1px solid var(--edge);box-shadow:0 -10px 30px rgba(0,0,0,.45);padding:0 12px calc(6px + env(safe-area-inset-bottom,0px))}",
    ".root.mini .fullonly{display:none!important}", ".root.full .minionly{display:none!important}",
    "[hidden]{display:none!important}",
    ".mono{font-family:VT323,'Roboto Mono',ui-monospace,monospace}",
    ".top{display:flex;align-items:center;gap:8px;height:52px;flex:none}",
    ".logo{display:flex;align-items:center;gap:6px;font:800 15px/1 system-ui,sans-serif;letter-spacing:.08em}", ".logo b{color:var(--amber)}",
    ".sp{flex:1}",
    ".reels{width:36px;height:16px;color:var(--amber-dim)}", ".spin .reels{color:var(--amber)}", ".spin .reel{animation:reel 1.6s linear infinite}",
    "@keyframes reel{to{transform:rotate(360deg)}}",
    "button{font:inherit;color:inherit;cursor:pointer}",
    ".btn{appearance:none;border:1px solid #0f1115;border-radius:8px;background:linear-gradient(180deg,#3a3f49,#262a31);box-shadow:0 1px 0 rgba(255,255,255,.08) inset,0 2px 0 #0c0e11;min-width:44px;height:44px;display:inline-grid;place-items:center;padding:0 12px;font-weight:600;font-size:13px;white-space:nowrap}",
    ".btn:active{transform:translateY(1px)}", ".btn svg{width:18px;height:18px;fill:currentColor}",
    ".btn.sm{height:36px;min-width:36px;padding:0 10px;font-size:12px}",
    ".btn.play{color:var(--amber);min-width:56px}",
    ".btn.on{color:var(--cyan);box-shadow:0 0 0 1px rgba(114,214,232,.35) inset,0 2px 0 #0c0e11}",
    ".btn.vk{color:#fff;background:linear-gradient(180deg,#3d73c7,#2a5aa5);border-color:#173a70}",
    ".btn.accent{color:#101216;background:linear-gradient(180deg,#ffc56f,#e99a2c);border-color:#7a4e12}",
    ".lcd{background:var(--lcd);border:1px solid var(--lcd-edge);border-radius:8px;padding:10px 12px;display:grid;gap:4px;flex:none}",
    ".row1{display:flex;gap:12px;align-items:end}",
    ".big{color:var(--amber);font-size:44px;line-height:.9;text-shadow:0 0 12px rgba(255,179,71,.35);font-variant-numeric:tabular-nums}",
    ".state{color:var(--amber);font-size:17px}",
    ".mq{min-width:0;overflow:hidden;white-space:nowrap;color:var(--amber);font-size:22px;line-height:1.1}",
    ".mq span{display:inline-block;padding-left:100%;animation:mq 14s linear infinite}", "@keyframes mq{to{transform:translateX(-100%)}}",
    "canvas{width:100%;height:56px;display:block}",
    "input[type=range]{-webkit-appearance:none;appearance:none;background:transparent;width:100%;height:30px;margin:0}",
    "input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--amber) var(--p,0%),#0b0d10 var(--p,0%))}",
    "input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:18px;border-radius:4px;margin-top:-6px;background:linear-gradient(180deg,#5a606c,#333842);border:1px solid #11141a}",
    ".tr{display:flex;gap:8px;justify-content:center;flex:none}", ".tr .btn{min-width:58px;height:50px}",
    ".tabs{display:flex;gap:4px;margin-top:10px;flex:none;border-bottom:1px solid var(--edge)}",
    ".tab{appearance:none;background:none;border:1px solid transparent;border-bottom:0;border-radius:8px 8px 0 0;padding:10px 12px;color:var(--ink2);font-weight:600;font-size:13px}",
    ".tab.sel{color:var(--ink);background:#12151a;border-color:var(--edge)}",
    ".libh{display:flex;gap:6px;align-items:center;margin-top:8px;flex:none;flex-wrap:wrap}",
    "select,input.text{min-width:0;flex:1;font:500 13px system-ui,sans-serif;color:var(--ink);background:#0f1115;border:1px solid var(--edge);border-radius:8px;height:40px;padding:0 8px}",
    ".list{flex:1;min-height:80px;overflow:auto;margin:6px -4px 0;padding:0 4px;list-style:none;-webkit-overflow-scrolling:touch}",
    ".item{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 6px;border-radius:8px;font:13px/1.25 'Roboto Mono',ui-monospace,monospace}",
    ".item.sel4{grid-template-columns:30px 30px minmax(0,1fr) auto}",
    ".item:active{background:#1a1e25}",
    ".item .n{color:var(--ink2);text-align:right;font-variant-numeric:tabular-nums}",
    ".item .tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".item small{display:block;color:var(--ink2);font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".item .d{color:var(--ink2);font-variant-numeric:tabular-nums}",
    ".item.cur{background:#1f1a12;color:var(--amber)}", ".item.cur .n,.item.cur .d{color:var(--amber)}",
    ".chk{width:22px;height:22px;border:2px solid var(--edge);border-radius:5px;display:grid;place-items:center;color:#101216;font-weight:900}",
    ".chk.on{background:var(--amber);border-color:var(--amber)}",
    ".x{appearance:none;background:none;border:0;color:var(--ink2);width:36px;height:36px;font-size:20px;border-radius:6px}",
    ".empty{padding:16px 6px;color:var(--ink2);line-height:1.5}", ".empty .btn{margin-top:10px}",
    ".foot{display:flex;gap:8px;align-items:center;justify-content:space-between;color:var(--ink2);font:12px ui-monospace,monospace;padding-top:6px;flex:none}",
    ".eq{flex:none;display:grid;gap:8px;padding-top:8px;border-top:1px solid var(--edge);margin-top:6px}",
    ".eqh{display:flex;gap:8px;align-items:center}",
    ".bands{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:2px;align-items:end}",
    ".band{display:grid;justify-items:center;gap:4px}",
    ".band input{writing-mode:vertical-lr;direction:rtl;width:26px;height:96px}",
    ".band input::-webkit-slider-runnable-track{width:6px;height:auto;background:#0b0d10}",
    ".band input::-webkit-slider-thumb{margin-top:0;margin-left:-8px;width:22px;height:14px}",
    ".band span{font:500 10px/1 ui-monospace,monospace;color:var(--ink2)}", ".band .v{color:var(--amber)}",
    ".note{font-size:12px;color:var(--ink2);line-height:1.45}", ".note.ok{color:var(--cyan)}",
    ".diag{position:relative}",
    ".diag pre{white-space:pre-wrap;word-break:break-all;font:11px/1.35 ui-monospace,monospace;color:var(--cyan);background:#0b0d10;border:1px solid var(--edge);border-radius:8px;padding:8px 40px 8px 8px;margin:8px 0 0;max-height:30vh;overflow:auto}",
    ".diag .x{position:absolute;top:10px;right:4px}",
    ".bar{display:flex;align-items:center;gap:8px;height:60px}",
    ".minilcd{flex:1;min-width:0;background:var(--lcd);border:1px solid var(--lcd-edge);border-radius:6px;padding:5px 8px;display:flex;gap:8px;align-items:center;overflow:hidden}",
    ".minilcd .t{color:var(--amber);font-size:20px;line-height:1;font-variant-numeric:tabular-nums}", ".minilcd .mq{font-size:18px;flex:1}",
    "@media (prefers-reduced-motion:reduce){.spin .reel,.mq span{animation:none}}"
  ].join("\n");

  var ICON = {
    play: '<svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6z"/></svg>',
    pause: '<svg viewBox="0 0 16 16"><path d="M3 2h4v12H3zM9 2h4v12H9z"/></svg>',
    prev: '<svg viewBox="0 0 16 16"><path d="M3 2h2v12H3zM14 2v12L6 8z"/></svg>',
    next: '<svg viewBox="0 0 16 16"><path d="M11 2h2v12h-2zM2 2v12l8-6z"/></svg>'
  };
  function reel(cx) {
    return '<g class="reel" style="transform-origin:' + cx + 'px 8px"><circle cx="' + cx + '" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="' + cx + '" cy="8" r="2" fill="currentColor"/></g>';
  }
  var REELS = '<svg class="reels" viewBox="0 0 36 16" aria-hidden="true">' + reel(8) + reel(28) + "</svg>";

  var root, $;

  function mount() {
    if (!document.body) return setTimeout(mount, 200);
    var host = document.createElement("div");
    host.id = "deka-overlay";
    document.documentElement.appendChild(host);
    var sh = host.attachShadow({ mode: "open" });
    var presetOpts = Object.keys(PRESETS).map(function (k) { return '<option value="' + k + '">' + PRESETS[k][0] + "</option>"; }).join("") + '<option value="custom">Свой</option>';
    var transport = IS_VIDEO
      ? '<button class="btn" id="back30">−30с</button><button class="btn play" id="play2" aria-label="Играть или пауза">' + ICON.play + '</button><button class="btn" id="fwd30">+30с</button>'
      : '<button class="btn" id="prev" aria-label="Предыдущий">' + ICON.prev + '</button><button class="btn play" id="play2" aria-label="Играть или пауза">' + ICON.play + '</button><button class="btn" id="next" aria-label="Следующий">' + ICON.next + "</button>";
    sh.innerHTML = "<style>" + CSS + "</style>" +
      '<div class="root">' +
      '<div class="top fullonly"><div class="logo">' + REELS + "<span>ДЕ<b>КА</b></span></div><span class=\"sp\"></span>" +
      (IS_VIDEO ? '<button class="btn" id="backMusic">← Музыка</button>' : '<button class="btn" id="files">Мои файлы</button>') +
      '<button class="btn vk" id="toVk">' + (IS_VIDEO ? "Видео" : "ВК") + "</button></div>" +
      '<div class="lcd fullonly"><div class="row1"><span class="big mono" id="big">00:00</span><span class="state mono" id="state">СТОП</span></div>' +
      '<div class="mq mono" id="mq2"><span>' + (IS_VIDEO ? "ДЕКА · СЕТ ЗАГРУЖАЕТСЯ" : "ДЕКА · ВЫБЕРИТЕ ТРЕК") + '</span></div><canvas id="viz"></canvas></div>' +
      '<input class="fullonly" type="range" id="seek" min="0" max="1000" value="0" aria-label="Позиция">' +
      '<div class="tr fullonly">' + transport + '<button class="btn" id="eqBtn">EQ</button></div>' +
      '<div class="eq fullonly" id="eq" hidden><div class="eqh"><select id="preset" aria-label="Пресет">' + presetOpts + "</select>" +
      '<button class="btn" id="eqon">ВКЛ</button></div><div class="bands" id="bands"></div>' +
      '<div class="note" id="fxnote">Эквалайзер подключится, когда заиграет звук</div></div>' +
      (IS_VIDEO
        ? '<div class="note fullonly" style="margin-top:10px">Сет играет как аудио: картинка скрыта, видео никуда не сохраняется. Кнопка «Видео» показывает страницу VK Видео.</div><div class="sp fullonly"></div>'
        : '<div class="tabs fullonly" role="tablist"><button class="tab" data-tab="music">Музыка</button><button class="tab" data-tab="playlists">Плейлисты</button><button class="tab" data-tab="sets">Сеты</button></div>' +
          '<div class="libh fullonly" id="libh"></div>' +
          '<ol class="list fullonly" id="list"></ol>' +
          '<div class="foot fullonly"><span id="count"></span><button class="btn sm" id="diagBtn">Диагностика</button></div>' +
          '<div class="diag fullonly" id="diag" hidden><pre id="diagText"></pre><button class="x" id="diagClose" aria-label="Закрыть диагностику">×</button></div>') +
      '<div class="bar minionly"><div class="minilcd"><span class="t mono" id="t">00:00</span><div class="mq mono" id="mq1"><span>ДЕКА</span></div></div>' +
      '<button class="btn play" id="play1" aria-label="Играть или пауза">' + ICON.play + '</button><button class="btn" id="toDeka">Дека</button></div>' +
      "</div>";
    root = sh.querySelector(".root");
    $ = function (id) { return sh.getElementById(id); };

    buildBands();
    $("preset").value = PRESETS[preset] ? preset : "custom";
    $("eqon").classList.toggle("on", fx.on);
    setView(view);

    $("toVk").onclick = function () { setView("vk"); };
    $("toDeka").onclick = function () { setView("deka"); };
    $("play1").onclick = $("play2").onclick = function () { cmd({ type: "toggle" }); };
    $("eqBtn").onclick = function () { eqOpen = !eqOpen; $("eq").hidden = !eqOpen; $("eqBtn").classList.toggle("on", eqOpen); };
    var seeking = false;
    $("seek").addEventListener("input", function () { seeking = true; paint($("seek")); $("big").textContent = fmt($("seek").value / 1000 * st.duration); });
    $("seek").addEventListener("change", function () { cmd({ type: "seek", time: $("seek").value / 1000 * st.duration }); seeking = false; });
    $("preset").onchange = function (e) {
      preset = e.target.value; store.set("preset", preset);
      if (PRESETS[preset]) { fx.gains = PRESETS[preset][1].slice(); syncBands(); sendFx(); }
    };
    $("eqon").onclick = function () { fx.on = !fx.on; $("eqon").classList.toggle("on", fx.on); sendFx(); };

    if (IS_VIDEO) {
      $("back30").onclick = function () { cmd({ type: "skip", by: -30 }); };
      $("fwd30").onclick = function () { cmd({ type: "skip", by: 30 }); };
      $("backMusic").onclick = function () {
        var info = { url: handoff && handoff.url, title: st.title, duration: st.duration };
        location.href = MUSIC_URL + "#deka-set=" + encodeURIComponent(JSON.stringify(info));
      };
    } else {
      $("prev").onclick = function () { step(-1); };
      $("next").onclick = function () { step(1); };
      $("files").onclick = function () { location.href = APP_URL; };
      Array.prototype.forEach.call(sh.querySelectorAll(".tab"), function (b) {
        b.onclick = function () { tab = b.getAttribute("data-tab"); store.set("tab", tab); openPl = null; selecting = null; renderLib(); };
      });
      $("list").addEventListener("click", onListClick);
      $("libh").addEventListener("click", onHeadClick);
      $("libh").addEventListener("change", onHeadChange);
      $("diagBtn").onclick = function () { cmd({ type: "diag" }); };
      $("diagClose").onclick = function () { $("diag").hidden = true; };
      window.addEventListener("deka:vk:playlist", function (e) { items = (e.detail && e.detail.items) || []; if (tab === "music") renderLib(); });
      // «Весь список»: мост долистывает страницу ВК до конца и отдаёт все треки.
      window.addEventListener("deka:vk:collect", function (e) {
        var d = e.detail || {};
        if (!collecting) return;
        if (!d.done) { $("count").textContent = "Собираю: " + tracksWord(d.count) + "…"; return; }
        collecting = false; store.set("collectingAt", 0);
        var all = d.items || [];
        // На странице «Мои треки» (/audios…) все треки ваши. На других страницах ВК
        // берём выбранный раздел, а если он не выбран — раздел «Мои треки», без рекомендаций.
        var nameOf = function (t) { return t.section || "Без названия"; };
        var mine;
        if (/\/audios/.test(location.pathname)) mine = all;
        else if (section !== ALL && section !== MYALL) mine = all.filter(function (t) { return nameOf(t) === section; });
        else {
          mine = all.filter(function (t) { return /^Мои|^My /i.test(nameOf(t)); });
          if (!mine.length) mine = all;
        }
        if (!mine.length) { $("count").textContent = "Треки не найдены. Войдите в ВК и нажмите «Весь список» ещё раз"; return; }
        myAll = mine.map(function (t) { return { key: t.key, title: t.title, artist: t.artist, duration: t.duration }; });
        store.set("myAll", myAll);
        section = MYALL; store.set("mSection", section);
        renderLib();
        $("count").textContent = "Сохранено: " + tracksWord(myAll.length) + " · раздел «" + MYALL.replace("★ ", "") + "»";
      });
      window.addEventListener("deka:vk:diag", function (e) {
        $("diag").hidden = false; $("diagText").textContent = "Пришлите скриншот этого окна\n" + JSON.stringify(e.detail, null, 1);
      });
      // Трек из очереди не нашёлся в ВК (удалён или недоступен): пропускаем его,
      // но не больше одного круга подряд, чтобы не крутиться без конца.
      var misses = 0;
      window.addEventListener("deka:vk:linkfail", function (e) {
        if (!(e.detail && e.detail.queue) || !queue) return;
        if (++misses >= Math.min(queue.list.length, 20)) { misses = 0; setState("НЕ НАЙДЕН"); return; }
        $("count").textContent = "Трек не найден в ВК, пропускаю";
        step(1);
      });
      window.addEventListener("deka:vk:state", function (e) { if (e.detail && !e.detail.paused) misses = 0; });
      window.addEventListener("deka:vk:ended", function () {
        // ВК может сам включить следующий трек; если это не тот, что в очереди Деки, переключаем.
        if (!queue) return;
        var want = queue.list[(queue.index + 1) % queue.list.length];
        setTimeout(function () {
          if (same(want, st) && !st.paused) { syncQueueIndex(); return; }
          step(1);
        }, 1200);
      });
      renderLib();
      cmd({ type: "refresh" });
    }

    window.addEventListener("deka:vk:state", function (e) { st = e.detail || st; stAt = performance.now(); render(); });
    window.addEventListener("deka:vk:spectrum", function (e) { spec = e.detail; });
    window.addEventListener("deka:vk:fx", function (e) {
      var ok = e.detail && e.detail.ok;
      $("fxnote").textContent = ok ? "Эквалайзер и спектр работают со звуком ВК" : "Эквалайзер недоступен для этого трека";
      $("fxnote").classList.toggle("ok", !!ok);
      if (ok) sendFx();
    });
    sendFx();

    function frame() {
      var t = now();
      $("t").textContent = fmt(t);
      if (view === "deka") {
        if (!seeking) {
          $("big").textContent = fmt(t);
          if (st.duration > 0) { $("seek").value = Math.round(t / st.duration * 1000); paint($("seek")); }
        }
        drawViz();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function setView(v) {
    view = v; if (!IS_VIDEO) store.set("view", v);
    root.classList.toggle("full", v === "deka");
    root.classList.toggle("mini", v !== "deka");
    try { document.body.style.paddingBottom = v === "deka" ? "" : "76px"; } catch (e) {}
  }
  function setState(text) { if ($) $("state").textContent = text; }

  // Пока играет музыка, Android держит foreground media service + PARTIAL_WAKE_LOCK.
  // Экран при этом может гаснуть; service нужен именно для фонового воспроизведения.
  var awake = null;
  function keepAwake(on) {
    if (on === awake) return; awake = on;
    try { if (window.DekaAndroid) window.DekaAndroid.keepAwake(on); } catch (e) {}
  }
  // При переходе экрана в background ещё раз подтверждаем service до того,
  // как WebView начнёт ограничивать таймеры.
  document.addEventListener("visibilitychange", function () {
    if (!st.paused) { awake = null; keepAwake(true); }
  });

  var lastKey = "";
  function render() {
    var playing = !st.paused;
    keepAwake(playing);
    root.classList.toggle("spin", playing);
    $("play1").innerHTML = $("play2").innerHTML = playing ? ICON.pause : ICON.play;
    setState(playing ? "ИГРАЕТ" : (st.currentTime > 0 ? "ПАУЗА" : "СТОП"));
    var key = (st.artist || "") + "|" + (st.title || "");
    if (key !== lastKey && st.title) {
      lastKey = key;
      var text = ((st.artist ? st.artist + " — " : "") + st.title + (st.duration ? " (" + fmt(st.duration) + ")" : "")).toUpperCase();
      $("mq1").firstChild.textContent = text;
      $("mq2").firstChild.textContent = text;
      if (!IS_VIDEO) { syncQueueIndex(); renderLib(); }
    }
  }

  // ---------- библиотека: вкладки ----------
  function sectionsOf() {
    var names = myAll.length ? [MYALL] : [];
    items.forEach(function (t) { var n = t.section || "Без названия"; if (names.indexOf(n) < 0) names.push(n); });
    return names;
  }
  function pageList() {
    var names = sectionsOf();
    if (names.indexOf(section) < 0 && section !== ALL) section = myAll.length ? MYALL : (names.filter(function (n) { return /^Мои|^My /i.test(n); })[0] || names[0] || ALL);
    if (section === MYALL) return myAll;
    return items.filter(function (t) { return section === ALL || (t.section || "Без названия") === section; });
  }
  function rowHtml(t, i, opts) {
    opts = opts || {};
    var cur = same(t, st) && st.title;
    var chk = opts.selectable ? '<span class="chk' + (opts.checked ? " on" : "") + '">' + (opts.checked ? "✓" : "") + "</span>" : "";
    var tail = opts.removable ? '<button class="x" data-del="' + i + '" aria-label="Убрать">×</button>' : '<span class="d">' + (t.duration ? fmt(t.duration) : "--:--") + "</span>";
    return '<li class="item' + (opts.selectable ? " sel4" : "") + (cur ? " cur" : "") + '" data-i="' + i + '"><span class="n">' + (i + 1) + ".</span>" + chk +
      '<span class="tt">' + esc(t.title) + "<small>" + esc(t.artist) + "</small></span>" + tail + "</li>";
  }
  function emptyHtml(text, vkBtn) {
    return '<li class="empty">' + text + (vkBtn ? '<br><button class="btn vk" data-act="vk">Открыть ВК</button>' : "") + "</li>";
  }

  var shown = []; // то, что сейчас в списке (для кликов)
  function renderLib() {
    if (!$ || IS_VIDEO) return;
    Array.prototype.forEach.call(root.querySelectorAll(".tab"), function (b) { b.classList.toggle("sel", b.getAttribute("data-tab") === tab); });
    var head = $("libh"), ol = $("list");
    if (tab === "music") {
      var list = pageList(); shown = list;
      if (selecting) {
        head.innerHTML = '<input class="text" id="plName" placeholder="Название плейлиста" value="' + esc(selecting.name || "") + '">' +
          '<button class="btn sm" data-act="selAll">Все</button><button class="btn sm accent" data-act="save">Сохранить</button><button class="btn sm" data-act="cancel">Отмена</button>';
      } else {
        var names = sectionsOf();
        head.innerHTML = '<select id="section" aria-label="Раздел ВК">' +
          names.map(function (n) { return '<option value="' + esc(n) + '"' + (n === section ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") +
          '<option value="' + ALL + '"' + (section === ALL ? " selected" : "") + ">Все разделы страницы</option></select>" +
          '<button class="btn sm" data-act="my">Мои треки</button><button class="btn sm accent" data-act="all">Весь список</button>' +
          '<button class="btn sm" data-act="more">Ещё</button><button class="btn sm" data-act="newpl">＋ Плейлист</button>';
      }
      ol.innerHTML = list.length
        ? list.map(function (t, i) { return rowHtml(t, i, selecting ? { selectable: true, checked: !!selecting.keys[t.key] } : null); }).join("")
        : emptyHtml(st.loggedIn === false ? "Войдите в ВК, чтобы увидеть свою музыку." : "Нажмите «Весь список» — Дека откроет «Мои треки», пролистает их до конца и сохранит все ваши треки по порядку.", true);
      $("count").textContent = selecting ? "Выбрано: " + Object.keys(selecting.keys).length : tracksWord(list.length);
    } else if (tab === "playlists") {
      if (openPl) {
        var pl = playlists.filter(function (p) { return p.id === openPl; })[0];
        if (!pl) { openPl = null; return renderLib(); }
        shown = pl.tracks;
        head.innerHTML = '<button class="btn sm" data-act="plBack">← Плейлисты</button><span class="sp" style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(pl.name) + "</span>" +
          '<button class="btn sm" data-act="plPlay">▶ Играть</button><button class="btn sm" data-act="plDel">Удалить</button>';
        ol.innerHTML = pl.tracks.length ? pl.tracks.map(function (t, i) { return rowHtml(t, i, { removable: true }); }).join("") : emptyHtml("Плейлист пуст.");
        $("count").textContent = tracksWord(pl.tracks.length);
      } else {
        shown = [];
        head.innerHTML = '<span class="note sp">Свои плейлисты Деки. Создать: вкладка «Музыка» → «＋ Плейлист».</span>';
        ol.innerHTML = playlists.length
          ? playlists.map(function (p, i) {
              return '<li class="item" data-pl="' + esc(p.id) + '"><span class="n">' + (i + 1) + '.</span><span class="tt">' + esc(p.name) + "<small>" + tracksWord(p.tracks.length) + '</small></span><span class="d">›</span></li>';
            }).join("")
          : emptyHtml("Пока нет плейлистов.");
        $("count").textContent = playlists.length + " " + plural(playlists.length, ["плейлист", "плейлиста", "плейлистов"]);
      }
    } else {
      shown = sets;
      head.innerHTML = '<input class="text" id="setUrl" type="url" placeholder="Ссылка на видео из VK Видео"><button class="btn sm accent" data-act="addSet">Добавить</button>' +
        '<span class="note" style="flex-basis:100%">Микс или сет играет как аудио, с эквалайзером и спектром. Видео никуда не сохраняется.</span>';
      ol.innerHTML = sets.length
        ? sets.map(function (s, i) {
            return '<li class="item" data-set="' + i + '"><span class="n">' + (i + 1) + '.</span><span class="tt">' + esc(s.title || "Сет") + "<small>" + esc(s.url.replace(/^https?:\/\//, "")) + "</small></span>" +
              '<button class="x" data-delset="' + i + '" aria-label="Убрать">×</button></li>';
          }).join("")
        : emptyHtml("Вставьте ссылку на видео из VK Видео: vkvideo.ru/video-…");
      $("count").textContent = sets.length + " " + plural(sets.length, ["сет", "сета", "сетов"]);
    }
  }

  function closestAttr(e, name) {
    var path = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (el && el.getAttribute && el.getAttribute(name) != null) return el.getAttribute(name);
      if (el === root) break;
    }
    return null;
  }
  function onListClick(e) {
    if (closestAttr(e, "data-act") === "vk") return setView("vk");
    var del = closestAttr(e, "data-del");
    if (del != null) {
      var pl = playlists.filter(function (p) { return p.id === openPl; })[0];
      if (pl) { pl.tracks.splice(+del, 1); store.set("playlists", playlists); renderLib(); }
      return;
    }
    var delset = closestAttr(e, "data-delset");
    if (delset != null) { sets.splice(+delset, 1); store.set("sets", sets); renderLib(); return; }
    var plId = closestAttr(e, "data-pl");
    if (plId != null) { openPl = plId; renderLib(); return; }
    var si = closestAttr(e, "data-set");
    if (si != null) { openSet(sets[+si]); return; }
    var i = closestAttr(e, "data-i");
    if (i == null) return;
    var t = shown[+i];
    if (selecting) {
      if (selecting.keys[t.key]) delete selecting.keys[t.key]; else selecting.keys[t.key] = t;
      keepName(); renderLib(); return;
    }
    startQueue(shown, +i);
  }
  function keepName() { var n = $("plName"); if (n && selecting) selecting.name = n.value; }
  function onHeadChange(e) {
    var path = e.composedPath ? e.composedPath() : [];
    if (path[0] && path[0].id === "section") { section = path[0].value; store.set("mSection", section); renderLib(); }
  }
  function onHeadClick(e) {
    var act = closestAttr(e, "data-act");
    if (!act) return;
    if (act === "my") cmd({ type: "openMy" });
    else if (act === "all") {
      collecting = true; store.set("collectingAt", Date.now());
      $("count").textContent = /\/audios/.test(location.pathname) ? "Собираю список…" : "Открываю «Мои треки»…";
      cmd({ type: "collectMy" });
    }
    else if (act === "more") cmd({ type: "more" });
    else if (act === "newpl") { selecting = { keys: {}, name: "" }; renderLib(); }
    else if (act === "selAll") { keepName(); pageList().forEach(function (t) { selecting.keys[t.key] = t; }); renderLib(); }
    else if (act === "cancel") { selecting = null; renderLib(); }
    else if (act === "save") {
      keepName();
      var chosen = pageList().filter(function (t) { return selecting.keys[t.key]; });
      if (!chosen.length) { $("count").textContent = "Отметьте хотя бы один трек"; return; }
      var name = (selecting.name || "").trim() || "Плейлист " + (playlists.length + 1);
      var pl = { id: "p" + Date.now(), name: name, tracks: chosen.map(function (t) { return { key: t.key, title: t.title, artist: t.artist, duration: t.duration }; }) };
      playlists.push(pl); store.set("playlists", playlists);
      selecting = null; tab = "playlists"; store.set("tab", tab); openPl = pl.id; renderLib();
    }
    else if (act === "plBack") { openPl = null; renderLib(); }
    else if (act === "plPlay") { var p = playlists.filter(function (x) { return x.id === openPl; })[0]; if (p && p.tracks.length) startQueue(p.tracks, 0); }
    else if (act === "plDel") { playlists = playlists.filter(function (x) { return x.id !== openPl; }); store.set("playlists", playlists); openPl = null; renderLib(); }
    else if (act === "addSet") {
      var raw = ($("setUrl").value || "").trim();
      var url = normalizeVideoUrl(raw);
      if (!url) { $("count").textContent = "Нужна ссылка на видео VK: vkvideo.ru/video-…"; return; }
      if (!sets.some(function (s) { return s.url === url; })) { sets.push({ url: url, title: "", duration: 0 }); store.set("sets", sets); }
      renderLib();
    }
  }
  function normalizeVideoUrl(raw) {
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
    var u; try { u = new URL(raw); } catch (e) { return null; }
    if (!/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(u.hostname)) return null;
    var m = (u.pathname + u.search).match(/video(-?\d+_\d+)/) || (u.search.match(/[?&]z=video(-?\d+_\d+)/));
    if (!m) return null;
    return "https://vkvideo.ru/video" + m[1];
  }
  function openSet(s) {
    if (!s) return;
    var info = { url: s.url, fx: fx, preset: preset };
    location.href = s.url + "#deka=" + encodeURIComponent(JSON.stringify(info));
  }

  function paint(el) { var min = +el.min, max = +el.max, v = +el.value; el.style.setProperty("--p", ((v - min) / (max - min) * 100) + "%"); }

  // ---------- эквалайзер ----------
  var bandEls = [];
  function bandEl(label, val, onChange) {
    var d = document.createElement("div"); d.className = "band";
    var v = document.createElement("span"); v.className = "v";
    var i = document.createElement("input"); i.type = "range"; i.min = -12; i.max = 12; i.step = 1; i.value = val;
    i.setAttribute("aria-label", label + " дБ");
    var l = document.createElement("span"); l.textContent = label;
    function upd() { v.textContent = (i.value > 0 ? "+" : "") + i.value; }
    i.addEventListener("input", function () { onChange(+i.value); upd(); });
    upd(); d.appendChild(v); d.appendChild(i); d.appendChild(l);
    return { d: d, i: i, upd: upd };
  }
  function buildBands() {
    var box = $("bands");
    box.appendChild(bandEl("PRE", fx.pre, function (x) { fx.pre = x; sendFx(); }).d);
    FREQS.forEach(function (f, idx) {
      var b = bandEl(f >= 1000 ? (f / 1000) + "K" : String(f), fx.gains[idx], function (x) {
        fx.gains[idx] = x; preset = "custom"; store.set("preset", preset); $("preset").value = "custom"; sendFx();
      });
      bandEls.push(b); box.appendChild(b.d);
    });
  }
  function syncBands() { bandEls.forEach(function (b, i) { b.i.value = fx.gains[i]; b.upd(); }); }

  // ---------- спектр ----------
  var peaks = new Array(40).fill(0);
  function drawViz() {
    var c = $("viz"), g = c.getContext("2d");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.clearRect(0, 0, w, h);
    var N = 40, gap = 2 * dpr, bw = (w - gap * (N - 1)) / N, playing = !st.paused;
    var grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, "#b86b12"); grad.addColorStop(0.65, "#ffb347"); grad.addColorStop(1, "#ff5d4a");
    for (var i = 0; i < N; i++) {
      var v = playing && spec ? (spec[i] || 0) / 255 : 0;
      var x = i * (bw + gap), bh = Math.max(dpr, v * h), cell = 3 * dpr;
      g.fillStyle = grad;
      for (var y = h; y > h - bh; y -= cell + dpr) g.fillRect(x, y - cell, bw, cell);
      peaks[i] = Math.max(v * h, peaks[i] - 1.2 * dpr);
      g.fillStyle = "#72d6e8"; g.fillRect(x, h - peaks[i] - 2 * dpr, bw, 2 * dpr);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
