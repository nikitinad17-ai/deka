/* Windows diagnostic path: VK owns navigation until the user opens Deka.
 * Inject FIRST, only on Windows. No credentials, network requests or stored UI mode.
 * Every new document starts native, including VK ID redirects and reloads. */
(function () {
  'use strict';
  if (window.top !== window || window.DekaNativeView) return;
  window.DEKA_MANUAL_VK = true;
  var native = true, mount = null, mounted = false, host = null, shadow = null;
  function notify() { window.dispatchEvent(new CustomEvent('deka2:view', { detail: { native: native } })); }
  function paint() {
    var overlay = document.getElementById('deka2-overlay');
    if (overlay) {
      if (native) overlay.style.setProperty('display', 'none', 'important');
      else overlay.style.removeProperty('display');
    }
    if (host) host.hidden = !native;
  }
  function hint(text) { if (shadow) shadow.getElementById('hint').textContent = text; }
  function showVK() {
    native = true;
    if (window.DekaLibrary) {
      if (DekaLibrary.cancelInteraction) DekaLibrary.cancelInteraction();
      else DekaLibrary.cancel();
    }
    paint(); notify();
  }
  function showDeka() {
    if (window.DekaSession) {
      var s = DekaSession.read();
      if (s.authPage || s.hasLoginForm) { hint('Завершите вход на странице VK. Пароль вводится только в VK.'); return; }
    }
    if (!mount) { hint('Пульт ещё не готов. Страница VK остаётся доступна.'); return; }
    native = false;
    try { if (!mounted) { mount(); mounted = true; } paint(); notify(); }
    catch (_) { native = true; paint(); hint('Пульт не запустился. Продолжайте проверку на странице VK.'); }
  }
  function summary() {
    var s = window.DekaSession ? DekaSession.read() : {}, d = {}, media = {}, l = {};
    try { d = window.DekaLibrary ? DekaLibrary.diagnostics() : {}; l = window.DekaLibrary ? DekaLibrary.get() : {}; } catch (_) {}
    try { media = window.__deka ? window.__deka.playback() : {}; } catch (_) {}
    // Allowlist: no credential values, account ID, query/hash, song names or page HTML.
    return { version: '0.2.3-windows', view: native ? 'vk' : 'deka',
      host: location.hostname, path: location.pathname, signedIn: s.authenticated === true,
      identityConflict: !!s.conflict, authPage: !!s.authPage,
      personalRows: d.personalRows || 0, excludedRows: d.excludedRows || 0,
      cachedTracks: (l.items || []).length, expected: d.expected || null,
      scrollTop: d.scrollTop || 0, scrollHeight: d.scrollHeight || 0, viewport: d.viewport || 0,
      moreButton: !!d.hasMore, scanning: !!(window.DekaLibrary && DekaLibrary.isRunning()),
      mediaFound: !!media.hasMedia, paused: media.paused !== false, mediaReady: media.readyState || 0,
      mediaError: media.mediaError || 0 };
  }
  function boot() {
    if (!document.documentElement || host) return;
    host = document.createElement('div'); host.id = 'deka2-native-toolbar';
    host.style.cssText = 'position:fixed!important;right:12px!important;bottom:12px!important;z-index:2147483647!important;max-width:calc(100vw - 24px)!important;';
    shadow = host.attachShadow({mode:'open'});
    shadow.innerHTML = '<style>:host{all:initial}:host([hidden]){display:none!important}*{box-sizing:border-box}section{font:13px/1.35 system-ui,sans-serif;color:#e7ecf3;background:#161d26;border:1px solid #485363;border-radius:9px;padding:9px;max-width:520px;box-shadow:0 3px 18px #0006}nav{display:flex;gap:7px;align-items:center;flex-wrap:wrap}span{margin-right:auto;font-size:12px}button{font:inherit;color:#fff;background:#28394e;border:1px solid #657891;border-radius:6px;padding:8px 12px;cursor:pointer}button:focus-visible{outline:2px solid #f5b44b}#returnToDeka{color:#f5b44b}#hint{margin:5px 0 0;max-width:440px;font-size:11px}textarea{width:100%;height:245px;margin-top:8px;background:#0d131a;color:#dfeaf6;font:12px/1.3 monospace;resize:vertical}[hidden]{display:none!important}</style><section><nav><span>VK · Дека 2 · 0.2.3</span><button id="details" type="button">Сведения</button><button id="returnToDeka" type="button">Вернуться в Деку</button></nav><p id="hint">Откройте «Мои треки» средствами VK. Автопереходов в Деку нет.</p><textarea id="report" aria-label="Безопасная диагностика" readonly hidden></textarea></section>';
    document.documentElement.appendChild(host);
    shadow.getElementById('returnToDeka').onclick = showDeka;
    shadow.getElementById('details').onclick = function () {
      var report = shadow.getElementById('report'); report.hidden = !report.hidden;
      if (!report.hidden) { report.value = JSON.stringify(summary(), null, 2); report.focus(); report.select(); }
    };
    paint();
  }
  window.DekaNativeView = { isNative: function () { return native; }, showVK: showVK, showDeka: showDeka,
    register: function (fn) { mount = fn; boot(); }, diagnostics: summary };
  window.addEventListener('deka2:session', function (e) {
    if (e.detail && (e.detail.authPage || e.detail.hasLoginForm)) showVK();
  });
  window.addEventListener('deka2:library-scan', function (e) {
    if (e.detail && e.detail.active) { native = true; paint(); notify(); }
    // Finishing or failing a scan never opens the app over VK.
  });
  window.addEventListener('pageshow', function () { native = true; paint(); notify(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
