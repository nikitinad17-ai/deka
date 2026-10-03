/* Deka's page adapter. Uses visible VK markup, not private API/audio downloads. */
(function () {
  'use strict';
  if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;
  if (window.DekaLibrary || !window.DekaLibraryCore || !window.__deka) return;
  var Core = window.DekaLibraryCore, original = window.__deka.cmd.bind(window.__deka);
  var SELECTOR = "[data-testid='MusicTrackRow'],[data-audio],.audio_item,.audio_row,[data-testid='audio-row'],[class*='AudioRow__root']";
  var rowMap = new Map(), cached = null, scope = '', runToken = 0, loading = false, snapshot = null, timer;
  function userId() {
    if(window.DekaSession)return window.DekaSession.userId()||'unknown';
    var v=window.vk||{},id=String(v.id||v.uid||(v.user&&v.user.id)||'');
    if(!/^[1-9]\d*$/.test(id)){var m=document.cookie.match(/(?:^|;\s*)remixmid=(\d+)/);id=m?m[1]:'';}
    return /^[1-9]\d*$/.test(id)?id:'unknown';
  }
  function ownPage(){return location.pathname==='/audios'+userId();}
  function landing(){return /^\/(audio|music)\/?$/.test(location.pathname)&&!/[?&](z|act)=/.test(location.search);}
  function viewSnapshot(){
    if(landing()&&userId()!=='unknown'){
      var saved=readStore('deka2:own-library:'+userId(),null);
      if(saved&&saved.source&&String(saved.source).split('|')[0]===userId()&&Array.isArray(saved.items)&&saved.items.length)return Object.assign({},saved,{status:'saved'});
    }
    return snapshot;
  }
  function sourceId() { return userId() + '|' + location.pathname + location.search; }
  function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function loadCache() {
    var key = sourceId();
    if (scope === key && cached) return;
    scope = key;
    cached = readStore('deka2:library:v2:' + scope, { items: [], complete: false, reason: 'saved' });
    cached.items = Core.merge([], Array.isArray(cached.items) ? cached.items : []);
    snapshot = Object.assign({}, cached, { count: cached.items.length, source: scope, status: 'saved' });
  }
  function persist() {
    try { localStorage.setItem('deka2:library:v2:' + scope, JSON.stringify(cached)); if(ownPage())localStorage.setItem('deka2:own-library:'+userId(),JSON.stringify(cached)); }
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
    return Array.from(document.querySelectorAll(SELECTOR)).filter(function (r, i, all) {
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
      try { data = JSON.parse(r.getAttribute('data-audio')); } catch (_) {}
      var holder = r.closest('[data-audio-id],[data-full-id]');
      var key = holder ? (holder.getAttribute('data-audio-id') || holder.getAttribute('data-full-id')) : r.getAttribute('data-id');
      var title = text(r, ["[data-testid='MusicTrackRow_Title']", '.audio_row__title_inner', '.ai_title', '[class*=Title]', '[class*=title]']);
      var artist = text(r, ["[data-testid='MusicTrackRow_Authors']", '.audio_row__performers', '.ai_artist', '[class*=Performer]', '[class*=artist]']);
      var dur = parseDur(text(r, ["[data-testid='MusicTrackRow_Duration']", '.audio_row__duration', '.ai_dur', '[class*=duration]']));
      if (Array.isArray(data) && data.length >= 6) {
        key = data[1] + '_' + data[0]; title = title || data[3]; artist = artist || data[4]; dur = +data[5] || dur;
      }
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
    if (p.source !== scope) return;
    snapshot = Object.assign({}, p, { items: Core.merge(cached.items, p.items), scanned: p.count });
    snapshot.count = snapshot.items.length;
    emit('library', snapshot);
  }
  async function collect(timing) {
    if (loading) return;
    if(window.DekaSession&&window.DekaSession.read().authenticated===false){emit('library',{items:[],source:sourceId(),status:'partial',reason:'login-required'});return;}
    collector = Core.createCollector(adapter, Object.assign({}, timing || {}, { onProgress: onProgress }));
    loadCache(); loading = true; runToken++;
    try {
      var result = await collector.run();
      if (result.source !== sourceId()) return;
      cached = Object.assign({}, result, { items: Core.saveResult(cached.items, result), updatedAt: Date.now() });
      cached.count = cached.items.length; cached.source=scope;
      snapshot = Object.assign({}, cached); persist();
      emit('library', snapshot);
      // Preserve the desktop CSV interface, but expose completeness separately.
      emit('vk:collect', Object.assign({}, snapshot, { done: true, page: location.pathname }));
      emit('vk:playlist', { items: cached.items, page: location.pathname });
    } finally { loading = false; }
  }
  function ownURL() {
    var uid = userId();
    if (/^\d+$/.test(uid)) return new URL('/audios' + uid, location.origin);
    var a = Array.from(document.querySelectorAll('a[href]')).find(function (n) {
      return /^(Мои треки|Моя музыка|My tracks|My music)$/i.test(n.textContent.trim());
    });
    if (a) { var u = new URL(a.getAttribute('href'), location.href); if (/(^|\.)(vk\.(ru|com))$/.test(u.hostname) && /audio/.test(u.pathname)) return u; }
    return null;
  }
  function collectMy() {
    if(window.DekaSession&&window.DekaSession.read().authenticated===false){emit('library',Object.assign({},snapshot,{status:'partial',reason:'login-required'}));return;}
    var u = ownURL();
    if (/^\/audios-?\d+/.test(location.pathname) && (!u || u.pathname === location.pathname)) return collect();
    if (!u) { emit('library', Object.assign({}, snapshot, { status: 'partial', complete: false, reason: 'choose-library' })); return; }
    u.hash = 'deka-library=collect'; // survives vk.ru -> m.vk.ru; sessionStorage does not
    location.assign(u.href);
  }
  async function playKey(key) {
    var target = String(key), numeric = /^(-?\d+_\d+)(?:#\d+)?$/.exec(target); if (numeric) target = numeric[1];
    var request = ++runToken;
    if (collector) collector.cancel();
    while (loading) await new Promise(function (r) { setTimeout(r, 50); });
    if(request!==runToken)return false;
    var oldSource = sourceId(), start = Date.now(), bottomSince=null;
    read();
    if (!rowMap.has(target)) { scrollTo(0); await new Promise(function (r) { setTimeout(r, 500); }); }
    while (request === runToken && oldSource === sourceId() && Date.now() - start < 90000) {
      read(); var row = rowMap.get(target);
      if (row && row.isConnected) {
        var button = row.querySelector("[data-testid='audiorow-tappable'],.audio_row__play_btn,.ai_play,.ai_body,[aria-label*='оспроизв']");
        (button || row).click(); return true;
      }
      var m = measure();
      if(m.top+m.height>=m.fullHeight-3&&!busy()){if(bottomSince===null)bottomSince=Date.now();if(Date.now()-bottomSince>8000)break;expand();}else bottomSince=null;
      scrollTo(m.top + Math.max(1, Math.floor(m.height * 0.6)));
      await new Promise(function (r) { setTimeout(r, 350); });
    }
    if (request === runToken) emit('vk:linkfail', { id: target, queue: true });
    return false;
  }
  window.__deka.cmd = function (c) {
    c = c || {};
    if (c.type === 'collectMy') return collectMy();
    if (c.type === 'collectAll') return collect();
    if (c.type === 'cancelCollect') { if (collector) collector.cancel(); return; }
    if (c.type === 'playRow' && !/^(-?\d+_\d+|meta:)/.test(String(c.key))) return original(c);
    if (c.type === 'playKey' || c.type === 'playRow') return playKey(c.key);
    if (c.type === 'pause' || c.type === 'stop') runToken++;
    return original(c);
  };
  window.DekaLibrary = { collect: collect, collectMy: collectMy, cancel: function () { if (collector) collector.cancel(); },
    get: function () { loadCache(); return viewSnapshot(); }, adapter: adapter,
    userId: userId, ownURL: ownURL, ownPage: ownPage, landing: landing, preferred: function(){return landing()?collectMy():collect();},
    playKey: playKey, isRunning: function () { return loading; } };
  // Retire the old same-origin-only flag before the old bridge's DOMContentLoaded callback.
  try { sessionStorage.removeItem('dekaCollect'); } catch (_) {}
  function boot() {
    loadCache(); emit('library', viewSnapshot());
    if (/deka-library=collect/.test(location.hash)) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
      collect();
    }
    var lastSource = sourceId();
    new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (sourceId() !== lastSource) { if (collector) collector.cancel(); runToken++; lastSource = sourceId(); loadCache(); emit('library', viewSnapshot()); }
        // Passive accumulation belongs only to this source; never shrink it to visible rows.
        if (!loading) {
          var found = read(), merged = Core.merge(cached.items, found);
          if (merged.length !== cached.items.length) {
            cached.items = merged; cached.complete = false; cached.reason = 'partial'; cached.source=scope;
            snapshot = Object.assign({}, cached, { status: 'saved', count: merged.length, expected: total(), source: scope });
            persist(); emit('library', viewSnapshot());
          }
        }
      }, 300);
    }).observe(document.body, { childList: true, subtree: true, characterData:true,attributes:true,attributeFilter:['data-audio-id','data-full-id','data-id','aria-busy'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
