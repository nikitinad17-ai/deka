/*
 * Дека · плеер поверх vk.ru (версия для телефона)
 * На Android у приложения одно окно, поэтому «Дека» открывает сам сайт ВК и кладёт
 * поверх него свою панель: снизу полоска с треком, по тапу — дисплей, спектр,
 * кнопки и эквалайзер. Звук и трек берутся из мостика vk-bridge.js на этой же странице.
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

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("deka:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("deka:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  var fx = store.get("fx", { on: true, pre: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bal: 0 });
  var preset = store.get("preset", "flat");
  var st = { paused: true, currentTime: 0, duration: 0, title: "", artist: "" };
  var stAt = 0, spec = null, open = false;

  function cmd(c) { if (window.__deka) window.__deka.cmd(c); }
  var fxTimer = null;
  function sendFx() {
    store.set("fx", fx);
    clearTimeout(fxTimer);
    fxTimer = setTimeout(function () { cmd({ type: "fx", on: fx.on, pre: fx.pre, gains: fx.gains, bal: fx.bal }); }, 60);
  }
  function now() { return st.paused ? st.currentTime : Math.min(st.duration || Infinity, st.currentTime + (performance.now() - stAt) / 1000); }
  function fmt(s) { if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    ".root{--desk:#101216;--chassis:#1b1e24;--hi:#262a32;--edge:#353a44;--lcd:#0a100d;--lcd-edge:#1d2a23;--amber:#ffb347;--amber-dim:#6b4a1d;--cyan:#72d6e8;--ink:#d6dae2;--ink2:#8d94a3;",
    "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;color:var(--ink);font:14px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;",
    "background:linear-gradient(180deg,var(--hi),var(--chassis) 52px);border-top:1px solid var(--edge);box-shadow:0 -10px 30px rgba(0,0,0,.45);",
    "padding:0 12px calc(8px + env(safe-area-inset-bottom,0px));-webkit-tap-highlight-color:transparent}",
    ".mono{font-family:VT323,'Roboto Mono',ui-monospace,monospace}",
    ".bar{display:flex;align-items:center;gap:10px;height:60px}",
    ".logo{display:flex;align-items:center;gap:6px;background:none;border:0;padding:0;color:var(--ink);font:800 13px/1 system-ui,sans-serif;letter-spacing:.08em}",
    ".logo b{color:var(--amber)}",
    ".reels{width:36px;height:16px;color:var(--amber-dim)}",
    ".spin .reels{color:var(--amber)}",
    ".spin .reel{animation:reel 1.6s linear infinite}",
    "@keyframes reel{to{transform:rotate(360deg)}}",
    ".mini{flex:1;min-width:0;background:var(--lcd);border:1px solid var(--lcd-edge);border-radius:6px;padding:5px 8px;display:flex;gap:8px;align-items:center;overflow:hidden}",
    ".mini .t{color:var(--amber);font-size:20px;line-height:1;font-variant-numeric:tabular-nums}",
    ".mq{flex:1;min-width:0;overflow:hidden;white-space:nowrap;color:var(--amber);font-size:18px;line-height:1}",
    ".mq span{display:inline-block;padding-left:100%;animation:mq 14s linear infinite}",
    "@keyframes mq{to{transform:translateX(-100%)}}",
    "button{font:inherit;color:inherit;cursor:pointer}",
    ".btn{appearance:none;border:1px solid #0f1115;border-radius:8px;background:linear-gradient(180deg,#3a3f49,#262a31);box-shadow:0 1px 0 rgba(255,255,255,.08) inset,0 2px 0 #0c0e11;min-width:44px;height:44px;display:inline-grid;place-items:center;padding:0 10px;font-weight:600;font-size:13px}",
    ".btn:active{transform:translateY(1px)}",
    ".btn svg{width:18px;height:18px;fill:currentColor}",
    ".btn.play{color:var(--amber);min-width:56px}",
    ".btn.on{color:var(--cyan);box-shadow:0 0 0 1px rgba(114,214,232,.35) inset,0 2px 0 #0c0e11}",
    ".sheet{padding:4px 0 6px;display:grid;gap:10px;max-height:72vh;overflow:auto}",
    ".sheet[hidden]{display:none}",
    ".lcd{background:var(--lcd);border:1px solid var(--lcd-edge);border-radius:8px;padding:10px 12px;display:grid;gap:4px}",
    ".big{color:var(--amber);font-size:44px;line-height:.9;text-shadow:0 0 12px rgba(255,179,71,.35);font-variant-numeric:tabular-nums}",
    ".state{color:var(--amber);font-size:17px}",
    ".lcd .mq{font-size:22px}",
    "canvas{width:100%;height:70px;display:block}",
    "input[type=range]{-webkit-appearance:none;appearance:none;background:transparent;width:100%;height:28px;margin:0}",
    "input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--amber) var(--p,0%),#0b0d10 var(--p,0%))}",
    "input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:18px;border-radius:4px;margin-top:-6px;background:linear-gradient(180deg,#5a606c,#333842);border:1px solid #11141a}",
    ".tr{display:flex;gap:8px;justify-content:center}",
    ".tr .btn{min-width:64px;height:52px}",
    ".eqh{display:flex;gap:8px;align-items:center}",
    ".eqh h3{margin:0;flex:1;font:600 11px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2)}",
    "select{font:500 13px system-ui,sans-serif;color:var(--ink);background:#0f1115;border:1px solid var(--edge);border-radius:8px;height:40px;padding:0 8px}",
    ".bands{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:2px;align-items:end}",
    ".band{display:grid;justify-items:center;gap:4px}",
    ".band input{writing-mode:vertical-lr;direction:rtl;width:26px;height:110px}",
    ".band input::-webkit-slider-runnable-track{width:6px;height:auto;background:#0b0d10}",
    ".band input::-webkit-slider-thumb{margin-top:0;margin-left:-8px;width:22px;height:14px}",
    ".band span{font:500 10px/1 ui-monospace,monospace;color:var(--ink2)}",
    ".band .v{color:var(--amber)}",
    ".note{font-size:12px;color:var(--ink2)}",
    ".note.ok{color:var(--cyan)}",
    ".row{display:flex;gap:8px}",
    ".row .btn{flex:1}",
    "@media (prefers-reduced-motion:reduce){.spin .reel,.mq span{animation:none}}"
  ].join("\n");

  var ICON = {
    play: '<svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6z"/></svg>',
    pause: '<svg viewBox="0 0 16 16"><path d="M3 2h4v12H3zM9 2h4v12H9z"/></svg>',
    prev: '<svg viewBox="0 0 16 16"><path d="M3 2h2v12H3zM14 2v12L6 8z"/></svg>',
    next: '<svg viewBox="0 0 16 16"><path d="M11 2h2v12h-2zM2 2v12l8-6z"/></svg>',
    up: '<svg viewBox="0 0 16 16"><path d="M8 4l6 7H2z"/></svg>',
    down: '<svg viewBox="0 0 16 16"><path d="M8 12L2 5h12z"/></svg>'
  };
  function reel(cx) {
    return '<g class="reel" style="transform-origin:' + cx + 'px 8px"><circle cx="' + cx + '" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="' + cx + '" cy="8" r="2" fill="currentColor"/></g>';
  }
  var REELS = '<svg class="reels" viewBox="0 0 36 16" aria-hidden="true">' + reel(8) + reel(28) + '</svg>';

  var host, root, $;

  function mount() {
    if (!document.body) return setTimeout(mount, 200);
    host = document.createElement("div");
    host.id = "deka-overlay";
    document.documentElement.appendChild(host);
    var sh = host.attachShadow({ mode: "open" });
    var presetOpts = Object.keys(PRESETS).map(function (k) { return '<option value="' + k + '">' + PRESETS[k][0] + "</option>"; }).join("") +
      '<option value="custom">Свой</option>';
    sh.innerHTML = "<style>" + CSS + "</style>" +
      '<div class="root">' +
      '  <div class="bar">' +
      '    <button class="logo" id="expand2" aria-label="Открыть Деку">' + REELS + "ДЕ<b>КА</b></button>" +
      '    <div class="mini"><span class="t mono" id="t">00:00</span><div class="mq mono" id="mq1"><span>ВКЛЮЧИТЕ ТРЕК В ВК</span></div></div>' +
      '    <button class="btn play" id="play1" aria-label="Играть или пауза">' + ICON.play + "</button>" +
      '    <button class="btn" id="expand" aria-label="Открыть панель Деки">' + ICON.up + "</button>" +
      "  </div>" +
      '  <div class="sheet" id="sheet" hidden>' +
      '    <div class="lcd"><div style="display:flex;gap:12px;align-items:end"><span class="big mono" id="big">00:00</span><span class="state mono" id="state">СТОП</span></div>' +
      '      <div class="mq mono" id="mq2"><span>ДЕКА · ВЫБЕРИТЕ ТРЕК В ВК</span></div><canvas id="viz"></canvas></div>' +
      '    <input type="range" id="seek" min="0" max="1000" value="0" aria-label="Позиция в треке">' +
      '    <div class="tr"><button class="btn" id="prev" aria-label="Предыдущий">' + ICON.prev + '</button>' +
      '      <button class="btn play" id="play2" aria-label="Играть или пауза">' + ICON.play + '</button>' +
      '      <button class="btn" id="next" aria-label="Следующий">' + ICON.next + "</button></div>" +
      '    <div class="eqh"><h3>Эквалайзер</h3><select id="preset" aria-label="Пресет">' + presetOpts + "</select>" +
      '      <button class="btn" id="eqon">ВКЛ</button></div>' +
      '    <div class="bands" id="bands"></div>' +
      '    <div class="note" id="fxnote">Эквалайзер подключится, когда заиграет трек</div>' +
      '    <div class="row"><button class="btn" id="files">Мои файлы</button><button class="btn" id="collapse">Свернуть</button></div>' +
      "  </div>" +
      "</div>";
    root = sh.querySelector(".root");
    $ = function (id) { return sh.getElementById(id); };

    // Чтобы панель не закрывала низ страницы ВК.
    try { document.body.style.paddingBottom = "76px"; } catch (e) {}

    buildBands();
    $("preset").value = PRESETS[preset] ? preset : "custom";
    $("eqon").classList.toggle("on", fx.on);
    function toggleSheet() { open = !open; $("sheet").hidden = !open; $("expand").innerHTML = open ? ICON.down : ICON.up; }
    $("expand").onclick = toggleSheet;
    $("expand2").onclick = toggleSheet;
    $("collapse").onclick = toggleSheet;
    $("play1").onclick = $("play2").onclick = function () { cmd({ type: "toggle" }); };
    $("prev").onclick = function () { cmd({ type: "prev" }); };
    $("next").onclick = function () { cmd({ type: "next" }); };
    $("files").onclick = function () { location.href = APP_URL; };
    var seeking = false;
    $("seek").addEventListener("input", function () { seeking = true; paint($("seek")); $("big").textContent = fmt($("seek").value / 1000 * st.duration); });
    $("seek").addEventListener("change", function () { cmd({ type: "seek", time: $("seek").value / 1000 * st.duration }); seeking = false; });
    $("preset").onchange = function (e) {
      preset = e.target.value; store.set("preset", preset);
      if (PRESETS[preset]) { fx.gains = PRESETS[preset][1].slice(); syncBands(); sendFx(); }
    };
    $("eqon").onclick = function () { fx.on = !fx.on; $("eqon").classList.toggle("on", fx.on); sendFx(); };

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
      if (open) {
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

  var lastKey = "";
  function render() {
    var playing = !st.paused;
    root.classList.toggle("spin", playing);
    $("play1").innerHTML = $("play2").innerHTML = playing ? ICON.pause : ICON.play;
    $("state").textContent = playing ? "ИГРАЕТ" : (st.currentTime > 0 ? "ПАУЗА" : "СТОП");
    var key = (st.artist || "") + "|" + (st.title || "");
    if (key !== lastKey && st.title) {
      lastKey = key;
      var text = (st.artist ? st.artist + " — " : "") + st.title + " (" + fmt(st.duration) + ")";
      $("mq1").firstChild.textContent = text.toUpperCase();
      $("mq2").firstChild.textContent = text.toUpperCase();
    }
  }

  function paint(el) {
    var min = +el.min, max = +el.max, v = +el.value;
    el.style.setProperty("--p", ((v - min) / (max - min) * 100) + "%");
  }

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
  }
  function syncBands() { bandEls.forEach(function (b, i) { b.i.value = fx.gains[i]; b.upd(); }); }

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
