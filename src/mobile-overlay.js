/*
 * Дека · интерфейс поверх vk.ru (версия для телефона)
 * На Android у приложения одно окно: в нём открыт сайт ВК, а Дека закрывает его
 * своим интерфейсом на весь экран. Сам сайт ВК показывается только по кнопке «ВК»
 * (для входа в аккаунт и поиска), тогда от Деки остаётся полоска снизу.
 * Звук, трек и список берутся из мостика vk-bridge.js на этой же странице.
 */
(function () {
  "use strict";
  if (window.top !== window) return;
  if (!/(^|\.)vk\.(ru|com)$/.test(location.hostname)) return;
  if (window.__dekaOverlay) return;
  window.__dekaOverlay = true;

  // Собственная страница приложения на Android (свои файлы).
  var APP_URL = "http://tauri.localhost/index.html";
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

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("deka:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("deka:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  var fx = store.get("fx", { on: true, pre: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bal: 0 });
  var preset = store.get("preset", "flat");
  var section = store.get("mSection", "");
  // «deka» — интерфейс Деки на весь экран, «vk» — виден сайт ВК, Дека полоской снизу.
  var view = store.get("view", "deka");
  var st = { paused: true, currentTime: 0, duration: 0, title: "", artist: "", loggedIn: true };
  var stAt = 0, spec = null, items = [], eqOpen = false;

  function cmd(c) { if (window.__deka) window.__deka.cmd(c); }
  var fxTimer = null;
  function sendFx() {
    store.set("fx", fx);
    clearTimeout(fxTimer);
    fxTimer = setTimeout(function () { cmd({ type: "fx", on: fx.on, pre: fx.pre, gains: fx.gains, bal: fx.bal }); }, 60);
  }
  function now() { return st.paused ? st.currentTime : Math.min(st.duration || Infinity, st.currentTime + (performance.now() - stAt) / 1000); }
  function fmt(s) { if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    ".root{--desk:#101216;--chassis:#1b1e24;--hi:#262a32;--edge:#353a44;--lcd:#0a100d;--lcd-edge:#1d2a23;--amber:#ffb347;--amber-dim:#6b4a1d;--cyan:#72d6e8;--ink:#d6dae2;--ink2:#8d94a3;",
    "position:fixed;z-index:2147483647;color:var(--ink);font:14px/1.3 system-ui,-apple-system,Roboto,sans-serif;-webkit-tap-highlight-color:transparent}",
    // Режим «Дека»: весь экран
    ".root.full{inset:0;background:radial-gradient(900px 400px at 20% -10%,#1c2029 0%,transparent 60%),var(--desk);display:flex;flex-direction:column;",
    "padding:calc(8px + env(safe-area-inset-top,0px)) 12px calc(8px + env(safe-area-inset-bottom,0px))}",
    // Режим «ВК»: полоска снизу
    ".root.mini{left:0;right:0;bottom:0;background:linear-gradient(180deg,var(--hi),var(--chassis) 52px);border-top:1px solid var(--edge);",
    "box-shadow:0 -10px 30px rgba(0,0,0,.45);padding:0 12px calc(6px + env(safe-area-inset-bottom,0px))}",
    ".root.mini .fullonly{display:none!important}",
    ".root.full .minionly{display:none!important}",
    ".mono{font-family:VT323,'Roboto Mono',ui-monospace,monospace}",
    ".top{display:flex;align-items:center;gap:8px;height:52px;flex:none}",
    ".logo{display:flex;align-items:center;gap:6px;font:800 15px/1 system-ui,sans-serif;letter-spacing:.08em}",
    ".logo b{color:var(--amber)}",
    ".sp{flex:1}",
    ".reels{width:36px;height:16px;color:var(--amber-dim)}",
    ".spin .reels{color:var(--amber)}",
    ".spin .reel{animation:reel 1.6s linear infinite}",
    "@keyframes reel{to{transform:rotate(360deg)}}",
    "button{font:inherit;color:inherit;cursor:pointer}",
    ".btn{appearance:none;border:1px solid #0f1115;border-radius:8px;background:linear-gradient(180deg,#3a3f49,#262a31);box-shadow:0 1px 0 rgba(255,255,255,.08) inset,0 2px 0 #0c0e11;min-width:44px;height:44px;display:inline-grid;place-items:center;padding:0 12px;font-weight:600;font-size:13px}",
    ".btn:active{transform:translateY(1px)}",
    ".btn svg{width:18px;height:18px;fill:currentColor}",
    ".btn.play{color:var(--amber);min-width:56px}",
    ".btn.on{color:var(--cyan);box-shadow:0 0 0 1px rgba(114,214,232,.35) inset,0 2px 0 #0c0e11}",
    ".btn.vk{color:#fff;background:linear-gradient(180deg,#3d73c7,#2a5aa5);border-color:#173a70}",
    ".lcd{background:var(--lcd);border:1px solid var(--lcd-edge);border-radius:8px;padding:10px 12px;display:grid;gap:4px;flex:none}",
    ".row1{display:flex;gap:12px;align-items:end}",
    ".big{color:var(--amber);font-size:44px;line-height:.9;text-shadow:0 0 12px rgba(255,179,71,.35);font-variant-numeric:tabular-nums}",
    ".state{color:var(--amber);font-size:17px}",
    ".mq{min-width:0;overflow:hidden;white-space:nowrap;color:var(--amber);font-size:22px;line-height:1.1}",
    ".mq span{display:inline-block;padding-left:100%;animation:mq 14s linear infinite}",
    "@keyframes mq{to{transform:translateX(-100%)}}",
    "canvas{width:100%;height:64px;display:block}",
    "input[type=range]{-webkit-appearance:none;appearance:none;background:transparent;width:100%;height:30px;margin:0}",
    "input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--amber) var(--p,0%),#0b0d10 var(--p,0%))}",
    "input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:18px;border-radius:4px;margin-top:-6px;background:linear-gradient(180deg,#5a606c,#333842);border:1px solid #11141a}",
    ".tr{display:flex;gap:8px;justify-content:center;flex:none}",
    ".tr .btn{min-width:64px;height:52px}",
    ".libh{display:flex;gap:8px;align-items:center;margin-top:10px;flex:none}",
    "select{min-width:0;flex:1;font:500 13px system-ui,sans-serif;color:var(--ink);background:#0f1115;border:1px solid var(--edge);border-radius:8px;height:40px;padding:0 8px}",
    ".list{flex:1;min-height:80px;overflow:auto;margin:8px -4px 0;padding:0 4px;list-style:none;-webkit-overflow-scrolling:touch}",
    ".item{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 6px;border-radius:8px;font:13px/1.25 'Roboto Mono',ui-monospace,monospace}",
    ".item:active{background:#1a1e25}",
    ".item .n{color:var(--ink2);text-align:right;font-variant-numeric:tabular-nums}",
    ".item .tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".item small{display:block;color:var(--ink2);font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".item .d{color:var(--ink2);font-variant-numeric:tabular-nums}",
    ".item.cur{background:#1f1a12;color:var(--amber)}",
    ".item.cur .n,.item.cur .d{color:var(--amber)}",
    ".empty{padding:16px 6px;color:var(--ink2);line-height:1.5}",
    ".empty .btn{margin-top:10px}",
    ".foot{display:flex;gap:8px;align-items:center;justify-content:space-between;color:var(--ink2);font:12px ui-monospace,monospace;padding-top:6px;flex:none}",
    ".eq{flex:none;display:grid;gap:8px;padding-top:8px;border-top:1px solid var(--edge);margin-top:6px}",
    ".eq[hidden]{display:none}",
    ".eqh{display:flex;gap:8px;align-items:center}",
    ".bands{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:2px;align-items:end}",
    ".band{display:grid;justify-items:center;gap:4px}",
    ".band input{writing-mode:vertical-lr;direction:rtl;width:26px;height:100px}",
    ".band input::-webkit-slider-runnable-track{width:6px;height:auto;background:#0b0d10}",
    ".band input::-webkit-slider-thumb{margin-top:0;margin-left:-8px;width:22px;height:14px}",
    ".band span{font:500 10px/1 ui-monospace,monospace;color:var(--ink2)}",
    ".band .v{color:var(--amber)}",
    ".note{font-size:12px;color:var(--ink2)}",
    ".note.ok{color:var(--cyan)}",
    "pre{white-space:pre-wrap;word-break:break-all;font:11px/1.35 ui-monospace,monospace;color:var(--cyan);background:#0b0d10;border:1px solid var(--edge);border-radius:8px;padding:8px;margin:8px 0 0;max-height:30vh;overflow:auto}",
    // мини-полоска
    ".bar{display:flex;align-items:center;gap:8px;height:60px}",
    ".minilcd{flex:1;min-width:0;background:var(--lcd);border:1px solid var(--lcd-edge);border-radius:6px;padding:5px 8px;display:flex;gap:8px;align-items:center;overflow:hidden}",
    ".minilcd .t{color:var(--amber);font-size:20px;line-height:1;font-variant-numeric:tabular-nums}",
    ".minilcd .mq{font-size:18px;flex:1}",
    "@media (prefers-reduced-motion:reduce){.spin .reel,.mq span{animation:none}}"
  ].join("\n");

  var ICON = {
    play: '<svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6z"/></svg>',
    pause: '<svg viewBox="0 0 16 16"><path d="M3 2h4v12H3zM9 2h4v12H9z"/></svg>',
    prev: '<svg viewBox="0 0 16 16"><path d="M3 2h2v12H3zM14 2v12L6 8z"/></svg>',
    next: '<svg viewBox="0 0 16 16"><path d="M11 2h2v12h-2zM2 2v12l8-6z"/></svg>'
  };
  function reel(cx) {
    return '<g class="reel" style="transform-origin:' + cx + 'px 8px"><circle cx="' + cx + '" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="' + cx + '" cy="8" r="2" fill="currentColor"/></g>';
  }
  var REELS = '<svg class="reels" viewBox="0 0 36 16" aria-hidden="true">' + reel(8) + reel(28) + "</svg>";

  var root, $;

  function mount() {
    if (!document.body) return setTimeout(mount, 200);
    var host = document.createElement("div");
    host.id = "deka-overlay";
    document.documentElement.appendChild(host);
    var sh = host.attachShadow({ mode: "open" });
    var presetOpts = Object.keys(PRESETS).map(function (k) { return '<option value="' + k + '">' + PRESETS[k][0] + "</option>"; }).join("") +
      '<option value="custom">Свой</option>';
    sh.innerHTML = "<style>" + CSS + "</style>" +
      '<div class="root">' +
      // ----- полный экран -----
      '<div class="top fullonly"><div class="logo">' + REELS + '<span>ДЕ<b>КА</b></span></div><span class="sp"></span>' +
      '  <button class="btn" id="files">Мои файлы</button><button class="btn vk" id="toVk">ВК</button></div>' +
      '<div class="lcd fullonly"><div class="row1"><span class="big mono" id="big">00:00</span><span class="state mono" id="state">СТОП</span></div>' +
      '  <div class="mq mono" id="mq2"><span>ДЕКА · ВЫБЕРИТЕ ТРЕК</span></div><canvas id="viz"></canvas></div>' +
      '<input class="fullonly" type="range" id="seek" min="0" max="1000" value="0" aria-label="Позиция в треке">' +
      '<div class="tr fullonly"><button class="btn" id="prev" aria-label="Предыдущий">' + ICON.prev + '</button>' +
      '  <button class="btn play" id="play2" aria-label="Играть или пауза">' + ICON.play + '</button>' +
      '  <button class="btn" id="next" aria-label="Следующий">' + ICON.next + '</button>' +
      '  <button class="btn" id="eqBtn">EQ</button></div>' +
      '<div class="eq fullonly" id="eq" hidden><div class="eqh"><select id="preset" aria-label="Пресет">' + presetOpts + "</select>" +
      '  <button class="btn" id="eqon">ВКЛ</button></div><div class="bands" id="bands"></div>' +
      '  <div class="note" id="fxnote">Эквалайзер подключится, когда заиграет трек</div></div>' +
      '<div class="libh fullonly"><select id="section" aria-label="Раздел ВК"></select><button class="btn" id="more">Ещё</button></div>' +
      '<ol class="list fullonly" id="list"></ol>' +
      '<div class="foot fullonly"><span id="count">0 треков</span><button class="btn" id="diagBtn" style="height:32px">Диагностика</button></div>' +
      '<pre class="fullonly" id="diag" hidden></pre>' +
      // ----- полоска в режиме ВК -----
      '<div class="bar minionly"><div class="minilcd"><span class="t mono" id="t">00:00</span><div class="mq mono" id="mq1"><span>ДЕКА</span></div></div>' +
      '  <button class="btn play" id="play1" aria-label="Играть или пауза">' + ICON.play + "</button>" +
      '  <button class="btn" id="toDeka">Дека</button></div>' +
      "</div>";
    root = sh.querySelector(".root");
    $ = function (id) { return sh.getElementById(id); };

    buildBands();
    $("preset").value = PRESETS[preset] ? preset : "custom";
    $("eqon").classList.toggle("on", fx.on);
    setView(view);

    $("toVk").onclick = function () { setView("vk"); };
    $("toDeka").onclick = function () { setView("deka"); };
    $("files").onclick = function () { location.href = APP_URL; };
    $("play1").onclick = $("play2").onclick = function () { cmd({ type: "toggle" }); };
    $("prev").onclick = function () { cmd({ type: "prev" }); };
    $("next").onclick = function () { cmd({ type: "next" }); };
    $("more").onclick = function () { cmd({ type: "more" }); };
    $("eqBtn").onclick = function () { eqOpen = !eqOpen; $("eq").hidden = !eqOpen; $("eqBtn").classList.toggle("on", eqOpen); };
    $("diagBtn").onclick = function () { cmd({ type: "diag" }); };
    $("section").onchange = function (e) { section = e.target.value; store.set("mSection", section); renderList(); };
    var seeking = false;
    $("seek").addEventListener("input", function () { seeking = true; paint($("seek")); $("big").textContent = fmt($("seek").value / 1000 * st.duration); });
    $("seek").addEventListener("change", function () { cmd({ type: "seek", time: $("seek").value / 1000 * st.duration }); seeking = false; });
    $("preset").onchange = function (e) {
      preset = e.target.value; store.set("preset", preset);
      if (PRESETS[preset]) { fx.gains = PRESETS[preset][1].slice(); syncBands(); sendFx(); }
    };
    $("eqon").onclick = function () { fx.on = !fx.on; $("eqon").classList.toggle("on", fx.on); sendFx(); };

    window.addEventListener("deka:vk:state", function (e) { st = e.detail || st; stAt = performance.now(); render(); });
    window.addEventListener("deka:vk:playlist", function (e) { items = (e.detail && e.detail.items) || []; renderList(); });
    window.addEventListener("deka:vk:spectrum", function (e) { spec = e.detail; });
    window.addEventListener("deka:vk:diag", function (e) {
      var d = $("diag"); d.hidden = false; d.textContent = "Пришлите скриншот этого окна\n" + JSON.stringify(e.detail, null, 1);
    });
    window.addEventListener("deka:vk:fx", function (e) {
      var ok = e.detail && e.detail.ok;
      $("fxnote").textContent = ok ? "Эквалайзер и спектр работают со звуком ВК" : "Эквалайзер недоступен для этого трека";
      $("fxnote").classList.toggle("ok", !!ok);
      if (ok) sendFx();
    });
    sendFx();
    cmd({ type: "refresh" });
    renderList();

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
    view = v; store.set("view", v);
    root.classList.toggle("full", v === "deka");
    root.classList.toggle("mini", v !== "deka");
    // В режиме ВК полоска не должна закрывать низ страницы.
    try { document.body.style.paddingBottom = v === "deka" ? "" : "76px"; } catch (e) {}
  }

  var lastKey = "";
  function render() {
    var playing = !st.paused;
    root.classList.toggle("spin", playing);
    $("play1").innerHTML = $("play2").innerHTML = playing ? ICON.pause : ICON.play;
    $("state").textContent = playing ? "ИГРАЕТ" : (st.currentTime > 0 ? "ПАУЗА" : "СТОП");
    var key = (st.artist || "") + "|" + (st.title || "");
    if (key !== lastKey && st.title) {
      lastKey = key;
      var text = ((st.artist ? st.artist + " — " : "") + st.title + " (" + fmt(st.duration) + ")").toUpperCase();
      $("mq1").firstChild.textContent = text;
      $("mq2").firstChild.textContent = text;
      renderList();
    }
    if (st.loggedIn === false && !items.length) renderList();
  }

  // ----- список треков -----
  function sectionsOf() {
    var names = [];
    items.forEach(function (t) { var n = t.section || "Без названия"; if (names.indexOf(n) < 0) names.push(n); });
    return names;
  }
  function renderList() {
    if (!$) return;
    var names = sectionsOf(), sel = $("section");
    if (names.indexOf(section) < 0 && section !== ALL) {
      section = names.filter(function (n) { return /^Мои|^My /i.test(n); })[0] || names[0] || ALL;
    }
    var sig = names.join("\u0000");
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      sel.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("") +
        '<option value="' + ALL + '">Все разделы страницы</option>';
    }
    sel.value = section;

    var list = items.filter(function (t) { return section === ALL || (t.section || "Без названия") === section; });
    var ol = $("list");
    if (!list.length) {
      ol.innerHTML = st.loggedIn === false
        ? '<li class="empty">Войдите в ВК, чтобы увидеть свою музыку.<br><button class="btn vk" data-act="vk">Открыть ВК</button></li>'
        : '<li class="empty">Здесь появятся треки со страницы ВК. Если пусто — нажмите «ВК», откройте свою музыку или плейлист и вернитесь в Деку.<br><button class="btn vk" data-act="vk">Открыть ВК</button></li>';
      $("count").textContent = "0 треков";
    } else {
      ol.innerHTML = list.map(function (t, i) {
        var cur = t.current || (st.title && t.title === st.title && t.artist === st.artist);
        return '<li class="item' + (cur ? " cur" : "") + '" data-key="' + esc(t.key) + '"><span class="n">' + (i + 1) + '.</span>' +
          '<span class="tt">' + esc(t.title) + "<small>" + esc(t.artist) + "</small></span>" +
          '<span class="d">' + (t.duration ? fmt(t.duration) : "--:--") + "</span></li>";
      }).join("");
      $("count").textContent = list.length + " " + plural(list.length, ["трек", "трека", "треков"]);
    }
  }
  function plural(n, f) { return f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2]; }
  function onListClick(e) {
    var path = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!el || !el.getAttribute) continue;
      if (el.getAttribute("data-act") === "vk") { setView("vk"); return; }
      var key = el.getAttribute("data-key");
      if (key) {
        cmd({ type: "playRow", key: key });
        $("state").textContent = "ЗАГРУЗКА";
        return;
      }
    }
  }

  function paint(el) {
    var min = +el.min, max = +el.max, v = +el.value;
    el.style.setProperty("--p", ((v - min) / (max - min) * 100) + "%");
  }

  // ----- эквалайзер -----
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
    var pre = bandEl("PRE", fx.pre, function (x) { fx.pre = x; sendFx(); });
    box.appendChild(pre.d);
    FREQS.forEach(function (f, idx) {
      var b = bandEl(f >= 1000 ? (f / 1000) + "K" : String(f), fx.gains[idx], function (x) {
        fx.gains[idx] = x; preset = "custom"; store.set("preset", preset); $("preset").value = "custom"; sendFx();
      });
      bandEls.push(b); box.appendChild(b.d);
    });
    $("list").addEventListener("click", onListClick);
  }
  function syncBands() { bandEls.forEach(function (b, i) { b.i.value = fx.gains[i]; b.upd(); }); }

  // ----- спектр -----
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
