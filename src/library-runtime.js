/* Deka's page adapter. Uses visible VK markup, not private API/audio downloads. */
(function () {
  'use strict';
  if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;
  if (window.DekaLibrary || !window.DekaLibraryCore || !window.__deka) return;
  var Core = window.DekaLibraryCore, original = window.__deka.cmd.bind(window.__deka);
  var SELECTOR = "[data-testid='MusicTrackRow'],[data-audio],.audio_item,.audio_row,[data-testid='audio-row'],[class*='AudioRow__root']";
  var rowMap = new Map(), cached = null, scope = '', runToken = 0, loading = false, snapshot = null, timer;
  var CACHE_VERSION = 3, activeAccount = '', lastPlay = null, pendingIntent = null;
  function session() {
    if (window.DekaSession) return window.DekaSession.read();
    var id = String((window.vk || {}).id || '');
    return { id: /^[1-9]\d*$/.test(id) ? id : '', authenticated: /^[1-9]\d*$/.test(id) ? true : null };
  }
  function userId() { var s = session(); return s.authenticated === true && s.id ? s.id : ''; }
  function ownPath() { return userId() ? '/audios' + userId() : ''; }
  function ownPage() {
    return !!ownPath() && location.pathname.replace(/\/$/, '') === ownPath() &&
      !/[?&](q|z|owner_id|playlist_id|act)=/.test(location.search || '');
  }
  function landing() { return /^\/(audio|music)\/?$/.test(location.pathname); }
  function sourceId() { return (userId() || 'unknown') + '|' + location.pathname + (location.search || ''); }
  function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function cacheKey() { return 'deka2:own-library:v3:' + userId(); }
  function empty(reason) {
    return { schema: CACHE_VERSION, accountId: userId(), items: [], count: 0, complete: false,
      reason: reason || 'not-loaded', status: 'saved', source: (userId() || 'unknown') + '|' + ownPath(), sourcePath: ownPath() };
  }
  function loadCache() {
    var uid = userId(), current = sourceId();
    if (uid === activeAccount && scope === current && cached) return;
    var changedAccount = activeAccount !== uid;
    activeAccount = uid; scope = current;
    // v2 could include recommendations or data indexed under a guessed identity.
    // Do not delete it, but never silently import it into a verified personal library.
    var saved = uid ? readStore(cacheKey(), null) : null;
    var valid = saved && saved.schema === CACHE_VERSION && saved.accountId === uid && saved.sourcePath === ownPath() && Array.isArray(saved.items);
    cached = valid ? Object.assign({}, saved, { items: Core.merge([], saved.items) }) : empty();
    cached.count = cached.items.length;
    snapshot = Object.assign({}, cached, { status: 'saved' });
    if (changedAccount) { runToken++; lastPlay = null; if (collector) collector.cancel(); }
  }
  function viewSnapshot() {
    loadCache();
    var s = session(), result = Object.assign({}, snapshot, { accountId: userId(), sourcePath: ownPath() });
    if (s.authenticated !== true) return Object.assign(empty(s.conflict ? 'identity-conflict' : s.authenticated === false ? 'login-required' : 'identity-unknown'), { status: 'partial' });
    // On discovery/profile pages only our own validated cache is visible, never their DOM rows.
    if (!ownPage() && !result.items.length) result.reason = 'open-own-library';
    return result;
  }
  function persist() {
    if (!ownPage() || !userId() || cached.accountId !== userId()) return;
    try { localStorage.setItem(cacheKey(), JSON.stringify(cached)); }
    catch (_) { snapshot.storageError = true; }
  }
  function emit(name, data) {
    window.dispatchEvent(new CustomEvent('deka2:' + name, { detail: data }));
    try {
      var p = window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.emitTo('main', name, data);
      if (p && p.catch) p.catch(function () {});
    } catch (_) {}
  }
  function text(el, selectors) {
    for (var i = 0; i < selectors.length; i++) { var n = el.querySelector(selectors[i]); if (n && n.textContent.trim()) return n.textContent.trim(); }
    return '';
  }
  function rows() {
    if (!ownPage()) return [];
    return Array.from(document.querySelectorAll(SELECTOR)).filter(function (r, i, all) {
      if (/(рекоменд|похож|для вас|вам понрав|популярн|recommend|similar|for you)/i.test(section(r))) return false;
      if (!r.getClientRects().length) return false;
      // Prefer MusicTrackRow when its wrapper also contains data-audio.
      if (!r.matches("[data-testid='MusicTrackRow']") && r.querySelector("[data-testid='MusicTrackRow']")) return false;
      return !all.some(function (other) { return other !== r && other.contains(r) && !other.querySelector("[data-testid='MusicTrackRow']"); });
    });
  }
  function section(el) {
    for (var p = el.parentElement, depth = 0; p && p !== document.body && depth < 14; p = p.parentElement, depth++) {
      var h = p.querySelector('h1,h2,h3,h4,[data-testid*=BlockHeader],[data-testid=headerlayout]');
      if (h && !h.closest(SELECTOR)) return h.textContent.trim();
    }
    return '';
  }
  function parseDur(t) { var m = String(t || '').match(/(\d+):(\d{2})(?::(\d{2}))?/); return m ? (m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]) : 0; }
  function read() {
    rowMap.clear();
    return rows().map(function (r) {
      var data = null;
      try { var dataNode = r.closest('[data-audio]'); data = dataNode ? JSON.parse(dataNode.getAttribute('data-audio')) : null; } catch (_) {}
      var holder = r.closest('[data-audio-id],[data-full-id]');
      var key = holder ? (holder.getAttribute('data-audio-id') || holder.getAttribute('data-full-id')) : r.getAttribute('data-id');
      var title = text(r, ["[data-testid='MusicTrackRow_Title']", '.audio_row__title_inner', '.ai_title', '[class*=Title]', '[class*=title]']);
      var artist = text(r, ["[data-testid='MusicTrackRow_Authors']", '.audio_row__performers', '.ai_artist', '[class*=Performer]', '[class*=artist]']);
      var dur = parseDur(text(r, ["[data-testid='MusicTrackRow_Duration']", '.audio_row__duration', '.ai_dur', '[class*=duration]']));
      if (Array.isArray(data) && data.length >= 6) {
        key = data[1] + '_' + data[0]; title = title || data[3]; artist = artist || data[4]; dur = +data[5] || dur;
      }
      if (key) { var numeric = /^(?:audio)?(-?\d+_\d+)(?:#\d+)?$/.exec(String(key)); if (numeric) key = numeric[1]; }
      var t = Core.clean({ key: key, title: title, artist: artist, duration: dur, section: section(r) });
      if (t) rowMap.set(t.key, r);
      return t;
    }).filter(Boolean);
  }
  function host() {
    var rs = rows(), first = rs.find(function (r) { return r.getClientRects().length; }) || rs[0];
    for (var p = first && first.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      var s = getComputedStyle(p);
      if (/(auto|scroll|overlay|hidden)/.test(s.overflowY) && p.clientHeight > 0 && p.scrollHeight > p.clientHeight + 2) return p;
    }
    return document.scrollingElement || document.documentElement;
  }
  function total() {
    var h = host();
    var nodes = [h].concat(Array.from(h.querySelectorAll('[aria-rowcount],[data-total-count],.audio_page__count')));
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], raw = n.getAttribute('aria-rowcount') || n.getAttribute('data-total-count');
      if (!raw && n.matches('.audio_page__count')) raw = n.textContent.replace(/[\s\u00a0]/g, '');
      if (/^\d+$/.test(raw || '') && +raw > 0 && +raw < 1000000) return +raw;
    }
    return null;
  }
  function measure() { var h = host(); return { top: h.scrollTop, height: h.clientHeight || innerHeight, fullHeight: h.scrollHeight }; }
  function scrollTo(top) { var h = host(); h.scrollTop = Math.max(0, top); h.dispatchEvent(new Event('scroll')); }
  function busy() { var h = host(); if (h.matches('[aria-busy=true]')) return true; return Array.from(h.querySelectorAll('[aria-busy=true],[role=progressbar]')).some(function (n) { return n.getClientRects().length; }); }
  function expand() {
    // Only real pagination buttons inside the list, never global recommendation links.
    var b = Array.from(host().querySelectorAll('button,[role=button]')).find(function (el) { return /^(Показать ещё|Загрузить ещё|Load more)$/i.test(el.textContent.trim()) && el.getClientRects().length; });
    if (b) b.click();
  }
  var adapter = { identity: sourceId, read: read, measure: measure, scrollTo: scrollTo, total: total, busy: busy, expand: expand };
  var collector = null;
  function onProgress(p) {
    if (p.source !== scope || p.source !== sourceId() || !ownPage()) return;
    snapshot = Object.assign({}, p, { schema: CACHE_VERSION, accountId: userId(), sourcePath: ownPath(), items: Core.merge(cached.items, p.items), scanned: p.count });
    snapshot.count = snapshot.items.length;
    emit('library', snapshot);
  }
  async function collect(timing) {
    if (loading) return;
    if (session().authenticated !== true || !ownPage()) { emit('library', viewSnapshot()); return; }
    collector = Core.createCollector(adapter, Object.assign({}, timing || {}, { onProgress: onProgress }));
    loadCache(); loading = true;
    try {
      var result = await collector.run();
      if (result.source !== sourceId()) return;
      cached = Object.assign({}, result, { schema: CACHE_VERSION, accountId: userId(), sourcePath: ownPath(), items: Core.saveResult(cached.items, result), updatedAt: Date.now() });
      cached.count = cached.items.length; cached.source=scope;
      snapshot = Object.assign({}, cached); persist();
      emit('library', snapshot);
      // Preserve the desktop CSV interface, but expose completeness separately.
      emit('vk:collect', Object.assign({}, snapshot, { done: true, page: location.pathname }));
      emit('vk:playlist', { items: cached.items, page: location.pathname });
    } finally { loading = false; }
  }
  function ownURL() {
    // Never take a profile/playlist owner or arbitrary "my music" link as the viewer's ID.
    return userId() ? new URL(ownPath(), location.origin) : null;
  }
  function collectMy() {
    var u = ownURL();
    if (!u) { emit('library', viewSnapshot()); return; }
    if (ownPage()) return collect();
    u.hash = 'deka-library=collect';
    location.assign(u.href);
  }
  function playback() {
    try { return window.__deka.playback ? window.__deka.playback() : {}; } catch (_) { return {}; }
  }
  function normalize(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function cancelled(request, oldSource) { return request !== runToken || oldSource !== sourceId() || !ownPage(); }
  function fail(target, reason) {
    emit('vk:linkfail', { id: target, queue: true, reason: reason });
    emit('playback-error', { reason: reason });
    return false;
  }
  function validIntent(value) {
    return value && value.version === 1 && value.accountId === userId() && value.sourcePath === ownPath() &&
      ['A','B'].includes(value.side) && value.createdAt <= Date.now() && Date.now() - value.createdAt < 120000 && Core.clean(value.track);
  }
  function takePendingPlay() {
    var value = pendingIntent; if (!value || !userId()) return null;
    pendingIntent = null;
    return validIntent(value) ? value : null;
  }
  function openForTrack(track, side) {
    var u = ownURL(); if (!u) return false;
    var intent = { version: 1, accountId: userId(), sourcePath: ownPath(), side: side === 'B' ? 'B' : 'A', createdAt: Date.now(), track: Core.clean(track) };
    // The fragment has only the selected track/owner, never passwords, cookies or tokens.
    // It survives a vk.ru -> m.vk.ru redirect where sessionStorage is a different origin.
    u.hash = 'deka2-play=' + encodeURIComponent(JSON.stringify(intent));
    location.assign(u.href); return { navigating: true };
  }
  async function confirmPlay(track, before, request, oldSource, timeout) {
    var until = Date.now() + timeout;
    while (Date.now() < until && !cancelled(request, oldSource)) {
      var now = playback();
      if (now.mediaError) return false;
      var matches = normalize(now.title) === normalize(track.title) &&
        (!track.artist || !now.artist || normalize(now.artist) === normalize(track.artist));
      var changedMedia = now.mediaGeneration > (before.mediaGeneration || 0);
      // A click alone is not evidence of playback. Require a running native media element,
      // advancement/new playing event, and matching metadata (when VK supplied metadata).
      if (now.hasMedia && now.playing && now.readyState >= 3 && !now.paused &&
          (changedMedia ? now.currentTime > 0.02 : now.currentTime > (before.currentTime || 0) + 0.02) &&
          (matches || (!now.title && changedMedia))) {
        lastPlay = { key: track.key, title: track.title, artist: track.artist, generation: now.mediaGeneration };
        emit('playback-confirmed', { key: track.key }); return true;
      }
      await new Promise(function (resolve) { setTimeout(resolve, 100); });
    }
    return false;
  }
  async function playKey(key, options) {
    options = options || {};
    loadCache();
    var uid = userId(), target = String(key), numeric = /^(?:audio)?(-?\d+_\d+)(?:#\d+)?$/.exec(target);
    if (numeric) target = numeric[1];
    if (!uid || (options.accountId && options.accountId !== uid)) return fail(target, 'account-required');
    var request = ++runToken;
    if (collector) collector.cancel();
    while (loading && request === runToken) await new Promise(function (resolve) { setTimeout(resolve, 25); });
    if (request !== runToken) return false;
    var known = cached.items.find(function (t) { return t.key === target; });
    if (!ownPage()) {
      // Fix: cached personal songs were being searched in /audio recommendations.
      // Navigate to the *same user's* source before trying to play, preserving the selected song.
      return known ? openForTrack(known, options.side) : fail(target, 'open-own-library');
    }
    var oldSource = sourceId(), start = Date.now(), bottomSince = null;
    var timeout = Number.isFinite(options.confirmMs) ? Math.max(100, Math.min(10000, options.confirmMs)) : 10000;
    var searchMs = Number.isFinite(options.searchMs) ? Math.max(100, Math.min(90000, options.searchMs)) : 90000;
    read();
    if (!rowMap.has(target)) { scrollTo(0); await new Promise(function (resolve) { setTimeout(resolve, 400); }); }
    while (!cancelled(request, oldSource) && Date.now() - start < searchMs) {
      var visible = read(), row = rowMap.get(target), track = visible.find(function (t) { return t.key === target; }) || known;
      if (row && row.isConnected && track) {
        var before = playback();
        if (lastPlay && lastPlay.key === target && before.mediaGeneration === lastPlay.generation) {
          if (before.hasMedia && !before.paused) return true;
          original({ type: 'play' });
        } else {
          var selector = "[data-testid='audiorow-tappable'],[data-testid='MusicTrackRow_PlayButton'],.audio_row__play_btn,.ai_play,.ai_body,button[aria-label*='оспроизв'],button[aria-label*='лушать'],button[aria-label*='Play']";
          // VK may place the tappable element around the row, not inside it.
          var button = row.matches(selector) ? row : row.querySelector(selector) || row.closest("[data-testid='audiorow-tappable']") || row;
          if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return fail(target, 'play-button-unavailable');
          button.click();
        }
        var ok = await confirmPlay(track, before, request, oldSource, timeout);
        if (cancelled(request, oldSource)) return false;
        return ok || fail(target, 'playback-not-started');
      }
      var m = measure();
      if (m.top + m.height >= m.fullHeight - 3 && !busy()) {
        if (bottomSince === null) bottomSince = Date.now();
        if (Date.now() - bottomSince > 8000) break;
        expand();
      } else bottomSince = null;
      scrollTo(m.top + Math.max(1, Math.floor(m.height * 0.6)));
      await new Promise(function (resolve) { setTimeout(resolve, 250); });
    }
    return cancelled(request, oldSource) ? false : fail(target, 'track-not-found');
  }
  window.__deka.cmd = function (c) {
    c = c || {};
    if (c.type === 'collectMy' || c.type === 'openMy') return collectMy();
    if (c.type === 'collectAll') return collectMy();
    if (c.type === 'cancelCollect') { if (collector) collector.cancel(); return; }
    if (c.type === 'playKey' || c.type === 'playRow') return playKey(c.key, c);
    if (c.type === 'pause' || c.type === 'stop') runToken++;
    return original(c);
  };
  window.DekaLibrary = { collect: collect, collectMy: collectMy, cancel: function () { if (collector) collector.cancel(); },
    get: viewSnapshot, adapter: adapter, userId: userId, ownURL: ownURL, ownPage: ownPage, landing: landing,
    preferred: collectMy, playKey: playKey, takePendingPlay: takePendingPlay, isRunning: function () { return loading; } };
  // Retire the old same-origin-only flag before the old bridge's DOMContentLoaded callback.
  try { ['dekaCollect','dekaAutoplay','dekaFind','dekaPlayKey'].forEach(function(k){ sessionStorage.removeItem(k); }); } catch (_) {}
  function boot() {
    // Remove obsolete autoplay intents which could substitute a recommendation for a missing song.
    try { sessionStorage.removeItem('dekaAutoplay'); sessionStorage.removeItem('dekaPlayKey'); } catch (_) {}
    loadCache(); emit('library', viewSnapshot());
    var hash = location.hash || '';
    if (hash.indexOf('#deka2-play=') === 0) {
      try { var candidate = JSON.parse(decodeURIComponent(hash.slice('#deka2-play='.length))); if (candidate && candidate.version === 1 && Number.isFinite(candidate.createdAt) && Date.now()-candidate.createdAt<120000) pendingIntent = candidate; } catch (_) {}
      try { history.replaceState(null, '', location.pathname + (location.search || '')); } catch (_) {}
    } else if (/deka-library=collect/.test(hash)) {
      try { history.replaceState(null, '', location.pathname + (location.search || '')); } catch (_) {}
      if (ownPage()) collect();
    }
    var lastSource = sourceId();
    function refresh() {
      timer = null;
      if (sourceId() !== lastSource) {
        if (collector) collector.cancel(); runToken++; lastSource = sourceId();
        loadCache(); emit('library', viewSnapshot());
      }
      // Never accumulate discovery/recommendations or a visited user's page as "my music".
      if (!loading && ownPage() && session().authenticated === true) {
        var found = read(), merged = Core.merge(cached.items, found);
        if (merged.length !== cached.items.length) {
          cached.items = merged; cached.count = merged.length; cached.complete = false; cached.reason = 'partial';
          cached.source = scope; cached.accountId = userId(); cached.sourcePath = ownPath(); cached.schema = CACHE_VERSION;
          snapshot = Object.assign({}, cached, { status: 'saved', expected: total() });
          persist(); emit('library', viewSnapshot());
        }
      }
    }
    window.addEventListener('deka2:session', refresh);
    var observer = new MutationObserver(function () { if (timer == null) timer = setTimeout(refresh, 300); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['data-audio-id','data-full-id','data-id','aria-busy'] });
    refresh();
    window.addEventListener('pagehide', function () { runToken++; if (collector) collector.cancel(); observer.disconnect(); clearTimeout(timer); }, { once: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
