/* Viewer identity only. Never infer the signed-in account from a visited profile,
 * an audio owner, a playlist URL, or the values of a sign-in form. */
(function () {
  'use strict';
  if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;
  if (window.DekaSession) return;
  function valid(value) { var s = String(value == null ? '' : value); return /^[1-9]\d*$/.test(s) ? s : ''; }
  function evidence() {
    var v = window.vk || {}, ids = [], cookie;
    try { cookie = document.cookie.match(/(?:^|;\s*)remixmid=(\d+)/); } catch (_) {}
    // vk.user is sometimes the *viewed* profile. It is NOT an identity source.
    [v.id, v.uid].forEach(function (value) { var id = valid(value); if (id && !ids.includes(id)) ids.push(id); });
    if (cookie && valid(cookie[1]) && !ids.includes(cookie[1])) ids.push(cookie[1]);
    var loggedOut = !!(cookie && !valid(cookie[1]));
    return { id: !loggedOut && ids.length === 1 ? ids[0] : '', conflict: ids.length > 1, loggedOut: loggedOut,
      evidence: cookie && valid(cookie[1]) ? 'session-id' : ids.length ? 'viewer-id' : 'unknown' };
  }
  function read() {
    var authPage = /^(id|oauth|login)\.vk\.(com|ru)$/.test(location.hostname) || /^\/(login|join|restore|auth)(\/|$)/.test(location.pathname);
    var form = Array.from(document.querySelectorAll('input[type=password],form[action*=login],[data-testid=left_menu_login_button]'))
      .some(function (n) { return !!n.getClientRects().length; });
    var e = evidence(), id = !authPage && !form ? e.id : '', name = '';
    if (id && document.querySelector) {
      var n = document.querySelector('#top_profile_name,[data-testid="top_profile_name"],.TopNavBtn__profileName');
      name = n ? n.textContent.trim().slice(0, 80) : '';
    }
    return { id: id, name: name, authenticated: authPage || form || e.loggedOut ? false : id ? true : null,
      authPage: authPage, hasLoginForm: form, conflict: e.conflict, evidence: e.evidence };
  }
  var last = '', timer = null, interval;
  function refresh() { var s = read(), key = JSON.stringify(s); if (last !== key) { last = key; window.dispatchEvent(new CustomEvent('deka2:session', { detail: s })); } return s; }
  function boot() {
    refresh();
    // Throttle rather than debounce: continuous playback mutations must not starve identity checks.
    var observer = new MutationObserver(function () { if (timer === null) timer = setTimeout(function () { timer = null; refresh(); }, 250); });
    observer.observe(document.body, { childList: true, subtree: true });
    interval = setInterval(refresh, 1000);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('pagehide', function () { observer.disconnect(); clearInterval(interval); clearTimeout(timer); }, { once: true });
  }
  window.DekaSession = { read: read, userId: function () { return read().id; }, refresh: refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
