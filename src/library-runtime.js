/* Deka's page adapter. Uses visible VK markup, not private API/audio downloads. */
(function () {
  'use strict';
  if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;
  if (window.DekaLibrary || !window.DekaLibraryCore || !window.__deka) return;
  var Core = window.DekaLibraryCore, original = window.__deka.cmd.bind(window.__deka);
  var SELECTOR = "[data-testid='MusicTrackRow'],[data-audio-id],[data-full-id],[data-audio],.audio_item,.audio_row,[data-testid='audio-row'],[class*='AudioRow__root']";
  var rowMap = new Map(), cached = null, scope = '', runToken = 0, loading = false, snapshot = null, timer;
  var CACHE_VERSION = 4, activeAccount = '', lastPlay = null, pendingIntent = null, preparing = false, lastSaved = 0;
  function session() {
    if (window.DekaSession) return window.DekaSession.read();
    var id = String((window.vk || {}).id || '');
    return { id: /^[1-9]\d*$/.test(id) ? id : '', authenticated: /^[1-9]\d*$/.test(id) ? true : null };
  }
  function userId() { var s = session(); return s.authenticated === true && s.id ? s.id : ''; }
  function ownPath() { return userId() ? '/audios' + userId() : ''; }
  function ownPage() { return personalRoute(); }
  function landing() { return /^\/(audio|music)\/?$/.test(location.pathname); }
  function sourceId() { return (userId() || 'unknown') + '|' + location.pathname + (location.search || ''); }
  function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function cacheKey() { return 'deka2:own-library:v4:' + userId(); }
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
    if (changedAccount) { pinnedHost = null; lastScope = null; runToken++; lastPlay = null; if (collector) collector.cancel(); }
  }
  function viewSnapshot() {
    loadCache();
    var s = session(), result = Object.assign({}, snapshot, { accountId: userId(), sourcePath: ownPath() });
    if (s.authenticated !== true) return Object.assign(empty(s.conflict ? 'identity-conflict' : s.authenticated === false ? 'login-required' : 'identity-unknown'), { status: 'partial' });
    // On discovery/profile pages only our own validated cache is visible, never their DOM rows.
    if (!ownPage() && !result.items.length && (!result.reason || result.reason==='not-loaded')) result.reason = 'open-own-library';
    return result;
  }
  function persist() {
    if ((!ownPage() && !selection().preview) || !userId() || cached.accountId !== userId()) return;
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
  // A row belongs to its nearest preceding section boundary, never to the
  // first heading found somewhere inside a shared page ancestor.
  var HEADINGS = 'h1,h2,h3,h4,[role=heading],[data-testid*=BlockHeader],[data-testid=headerlayout],.audio_block__title,.CatalogBlock__header,.CatalogBlock__title,.audio_page_block__title,.page_block_h2';
  var PERSONAL = /^(мои (треки|аудиозаписи|песни)|моя (музыка|библиотека)|my (music|tracks|audio)|your (music|tracks)|все (мои )?(треки|аудиозаписи)|all tracks|треки|аудиозаписи|tracks)(?:\s|$|[·:(])/i;
  var DISCOVERY = /(рекоменд|похож|для вас|вам (?:может )?понрав|популярн|недавно прослуш|вы слушали|собран[оы] для|новинки|чарт|recommend|similar|for you|suggest|related|recently played|you may|you might|based on|chart)/i;
  var boundaryMemo = new WeakMap();
  var pinnedHost = null, lastScope = null, pagingClick = { element: null, at: 0 };
  function shown(n) { return !!(n && n.isConnected && n.getClientRects().length && !n.closest('[hidden],[aria-hidden="true"]')); }
  function ownLabel(n) { return (n && n.textContent || '').trim().replace(/\s+/g, ' '); }
  function marker(n) {
    if (!n || n === document.body || n === document.documentElement || n.matches(SELECTOR)) return '';
    var token = [n.id, String(n.className || ''), n.getAttribute('data-testid'), n.getAttribute('data-section'), n.getAttribute('aria-label')].join(' ');
    if (DISCOVERY.test(token)) return 'recommendations';
    return '';
  }
  function boundary(node) {
    if (!node || !shown(node) || node.matches(SELECTOR)) return null;
    if (marker(node)) return { node: node, label: 'recommendations', recommendation: true };
    var h = node.matches(HEADINGS) ? node : Array.from(node.querySelectorAll(HEADINGS)).find(function (h) {
      return shown(h) && !h.closest(SELECTOR);
    });
    // A preceding block with its own tracks is a separate section, not our label.
    if (!h || (!node.matches(HEADINGS) && node.querySelector(SELECTOR))) return null;
    var leaf = h.querySelector('.CatalogBlock__title,.audio_page_block__title');
    if (leaf) h = leaf;
    var label = ownLabel(h);
    return label ? { node: h, label: label, recommendation: DISCOVERY.test(label) } : null;
  }
  function rowBoundary(row) {
    if (boundaryMemo.has(row)) return boundaryMemo.get(row);
    function found(b) { boundaryMemo.set(row, b); return b; }
    // Attribute-labelled recommendation containers win over generic "My music" headings.
    for (var p = row.parentElement; p && p !== document.body; p = p.parentElement) {
      if (marker(p)) return found({ node: p, label: 'recommendations', recommendation: true });
    }
    for (var current = row, depth = 0; current && current !== document.body && depth < 20; current = current.parentElement, depth++) {
      for (var prev = current.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (boundaryMemo.has(prev)) return found(boundaryMemo.get(prev));
        var b = boundary(prev); if (b) return found(b);
      }
      var label = current.getAttribute('aria-label');
      if (label && !current.matches(SELECTOR) && (PERSONAL.test(label) || DISCOVERY.test(label)))
        return found({ node: current, label: label, recommendation: DISCOVERY.test(label) });
    }
    return found({ node: null, label: '', recommendation: false });
  }
  function nativeRows() {
    var all = Array.from(document.querySelectorAll(SELECTOR));
    return all.filter(function (r) {
      if (!shown(r)) return false;
      if (!r.matches("[data-testid='MusicTrackRow']") && r.querySelector("[data-testid='MusicTrackRow']")) return false;
      var outer = r.parentElement && r.parentElement.closest(SELECTOR);
      return !outer || !!outer.querySelector("[data-testid='MusicTrackRow']");
    });
  }
  var ROUTE_KEY = 'deka2:personal-route:v1', NAV_KEY = 'deka2:personal-load:v1';
  function sessionValue(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch (_) { return null; } }
  function putSession(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function currentRoute() { return location.pathname + (location.search || ''); }
  function verifiedRoute() {
    var r = sessionValue(ROUTE_KEY);
    return r && r.accountId === userId() && r.origin === location.origin &&
      r.path === currentRoute() && Date.now() - r.at >= 0 && Date.now() - r.at < 86400000;
  }
  function personalRoute() {
    var path = location.pathname.replace(/\/$/, ''), query = new URLSearchParams(location.search || '');
    if (!userId() || query.has('q') || query.has('z') || query.has('playlist_id') ||
        (query.has('owner_id') && query.get('owner_id') !== userId())) return false;
    if (path === ownPath() || verifiedRoute()) return true;
    if (!/^\/(audio|music)(\/my|\/my_music|\/tracks)?$/.test(path)) return false;
    var active = Array.from(document.querySelectorAll('[role=tab][aria-selected=true],a[aria-current=page],.ui_tab_sel,.audio_page__top_tab_selected,.CatalogSection__tab--selected')).filter(shown);
    if (active.some(function (n) { return DISCOVERY.test(ownLabel(n)); })) return false;
    var explicitRoute = /\/(my|my_music|tracks)$/.test(path) || /^(my|my_music|all|tracks)$/.test(query.get('section') || query.get('act') || '');
    return active.some(function (n) { return PERSONAL.test(ownLabel(n)); }) || explicitRoute &&
      Array.from(document.querySelectorAll(HEADINGS)).some(function (n) { return shown(n) && !n.closest(SELECTOR) && PERSONAL.test(ownLabel(n)); });
  }
  function selection() {
    boundaryMemo = new WeakMap();
    var isPersonal = ownPage();
    // Only the explicitly named personal preview, never the whole discovery page.
    var previewAllowed = !isPersonal && userId() && landing() &&
      !/[?&](q|z|playlist_id|owner_id)=/.test(location.search || '') &&
      !Array.from(document.querySelectorAll('[role=tab][aria-selected=true]')).some(function(n){return DISCOVERY.test(ownLabel(n));});
    if (!isPersonal && !previewAllowed) return { rows: [], all: [], header: null, box: null, reason: 'open-own-library' };
    var all = nativeRows(), entries = all.map(function (r) { return { row: r, boundary: rowBoundary(r) }; });
    var personal = entries.find(function (e) {
      return !e.boundary.recommendation && PERSONAL.test(e.boundary.label) &&
        (isPersonal || /^(мои |моя |my |your )/i.test(e.boundary.label));
    });
    var chosen = entries.filter(function (e) {
      if (e.boundary.recommendation || (!isPersonal && !personal)) return false;
      // Once an explicit personal list exists, unknown/other sections do not join it.
      return personal ? e.boundary.node === personal.boundary.node : !e.boundary.label || /^(аудиозаписи|музыка)(?:\s|$)/i.test(e.boundary.label);
    }).map(function (e) { return e.row; });
    var box = chosen[0] && chosen[0].parentElement;
    // Grow within this list only; stop before any sibling recommendation/other section.
    while (box && box.parentElement && box.parentElement !== document.body) {
      var parent = box.parentElement;
      if (all.some(function (r) { return parent.contains(r) && !chosen.includes(r); })) break;
      box = parent;
    }
    var end = box;
    // Include the native loading sentinel / pagination after the final row.
    // Stopping one pixel before the sentinel prevents IntersectionObserver loading.
    for (var next = box && box.nextElementSibling; next; next = next.nextElementSibling) {
      var edge = boundary(next);
      if (marker(next) || (edge && (edge.recommendation || !PERSONAL.test(edge.label)))) break;
      if (all.some(function (r) { return next.contains(r) && !chosen.includes(r); })) break;
      end = next;
    }
    var result = { preview: !isPersonal, end: end, rows: chosen, all: all, header: personal && personal.boundary.node, box: box,
      excluded: all.length - chosen.length, reason: chosen.length ? '' : 'no-personal-rows' };
    if (chosen.length) lastScope = result;
    return result;
  }
  function rows() { return selection().rows; }
  function section(el) { return rowBoundary(el).label; }
  function parseDur(t) { var m = String(t || '').match(/(\d+):(\d{2})(?::(\d{2}))?/); return m ? (m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]) : 0; }
  function read() {
    rowMap.clear();
    return rows().map(function (r) {
      var data = null;
      try { var dataNode = r.closest('[data-audio]'); data = dataNode ? JSON.parse(dataNode.getAttribute('data-audio')) : null; } catch (_) {}
      var holder = r.closest('[data-audio-id],[data-full-id]');
      var key = holder ? (holder.getAttribute('data-audio-id') || holder.getAttribute('data-full-id')) : r.getAttribute('data-id') || r.id;
      var title = text(r, ["[data-testid='MusicTrackRow_Title']", '.audio_row__title_inner', '.audio_row__title', '.ai_title', '[class*=Title]', '[class*=title]']);
      var artist = text(r, ["[data-testid='MusicTrackRow_Authors']", '.audio_row__performers', '.audio_row__performer', '.ai_artist', '[class*=Performer]', '[class*=artist]']);
      var dur = parseDur(text(r, ["[data-testid='MusicTrackRow_Duration']", '.audio_row__duration', '.ai_dur', '[class*=duration]']));
      if (Array.isArray(data) && data.length >= 6) { key = data[1] + '_' + data[0]; title = title || data[3]; artist = artist || data[4]; dur = +data[5] || dur; }
      if (key) { var numeric = /^(?:audio)?(-?\d+_\d+)(?:#\d+)?$/.exec(String(key)); if (numeric) key = numeric[1]; }
      var t = Core.clean({ key: key, title: title, artist: artist, duration: dur, section: section(r) });
      if (t) rowMap.set(t.key, r);
      return t;
    }).filter(Boolean);
  }
  function host() {
    if (loading && pinnedHost && pinnedHost.isConnected) return pinnedHost;
    var first = rows()[0], candidate = null;
    for (var p = first && first.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      var s = getComputedStyle(p);
      // overflow:hidden is a clip/preview, not the native scrolling list.
      if (/^(auto|scroll|overlay)$/.test(s.overflowY) && p.clientHeight > 0) {
        if (!candidate) candidate = p;
        if (p.scrollHeight > p.clientHeight + 2) return p;
      }
    }
    return candidate || document.scrollingElement || document.documentElement;
  }
  function total() {
    var s = selection(), root = s.box, heading = s.header;
    if (!root) return null;
    var selector = '[aria-rowcount],[data-total-count],.audio_page__count,.page_block_header_count,[data-testid=MusicTracksCount]';
    var nodes = [root].concat(Array.from(root.querySelectorAll(selector)));
    // A count on a shared scroll host may include recommendations. Do not use it.
    if (heading && heading.parentElement && !heading.parentElement.querySelector(SELECTOR)) nodes = nodes.concat(Array.from(heading.parentElement.querySelectorAll(selector)));
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (s.all.some(function (r) { return n.contains(r) && !s.rows.includes(r); }) || marker(n)) continue;
      var raw = n.getAttribute('aria-rowcount') || n.getAttribute('data-total-count');
      if (!raw && n.matches('.audio_page__count,.page_block_header_count,[data-testid=MusicTracksCount]')) raw = n.textContent.replace(/[\s\u00a0]/g, '');
      if (/^\d+$/.test(raw || '') && +raw > 0 && +raw < 1000000) return +raw;
    }
    if (heading) {
      var m = ownLabel(heading).match(/(?:\(|·|:|\s)([\d\s\u00a0]+)\)?$/);
      if (m && PERSONAL.test(ownLabel(heading))) { var count = +m[1].replace(/\s/g, ''); if (count > 0 && count < 1000000) return count; }
    }
    return null;
  }
  function measure() {
    var h = host(), s = selection(), height = h.clientHeight || innerHeight, full = h.scrollHeight;
    // Stop at the personal list boundary, not at the bottom of an infinite
    // recommendation feed that happens to share the same page scroll host.
    if (s.excluded && s.box && s.box !== h && h.contains(s.box) && s.rows.length) {
      var top = h === document.scrollingElement ? 0 : h.getBoundingClientRect().top + h.clientTop;
      full = Math.min(full, Math.max(height, Math.ceil(h.scrollTop + (s.end || s.box).getBoundingClientRect().bottom - top)));
    }
    return { top: h.scrollTop, height: height, fullHeight: full };
  }
  function scrollTo(top) { var h = host(); h.scrollTop = Math.max(0, top); h.dispatchEvent(new Event('scroll')); }
  function busy() {
    var s = selection(), h = s.box || (lastScope && lastScope.box);
    if (!h || !h.isConnected) return false;
    return h.matches('[aria-busy=true]') || Array.from(h.querySelectorAll('[aria-busy=true],[role=progressbar]')).some(shown);
  }
  function moreButton(full) {
    var s = selection(), box = s.box || (lastScope && lastScope.box);
    if (!box) return null;
    var candidates = Array.from(box.querySelectorAll('a,button,[role=button],.audio_more,.show_more'));
    // Controls can be siblings of a clipped preview or of the header. Keep the
    // same section boundary rather than accidentally using a global 'more' button.
    if (full && s.header) {
      var headerBox = s.header.parentElement;
      if (headerBox && !headerBox.querySelector(SELECTOR))
        candidates = Array.from(headerBox.querySelectorAll('a,button,[role=button]')).concat(candidates);
    }
    if (s.header) candidates = candidates.concat(Array.from(document.querySelectorAll('a,button,[role=button],.audio_more,.show_more')).filter(function (el) {
      var b = rowBoundary(el); return b.node === s.header && !b.recommendation;
    }));
    return candidates.find(function (el) {
      if (!shown(el) || el.closest(SELECTOR) || el.disabled || el.getAttribute('aria-disabled') === 'true' || rowBoundary(el).recommendation || marker(el)) return false;
      var value = ownLabel(el).replace(/[·:()\d]/g, '').trim();
      if (full) return /^(показать|посмотреть|смотреть|открыть|все|все мои|show|see|view)(?:\s+(?:все|всё|треки|аудиозаписи|мои треки|аудио|all|tracks|music))*$/i.test(value);
      return /^(показать|загрузить|ещ[её]|show|load)(?:\s+(?:ещ[её]|больше|треки|аудиозаписи|more))*$/i.test(value);
    }) || null;
  }
  function safeMusicLink(button) {
    if (!button || !button.hasAttribute('href')) return null;
    try {
      var url = new URL(button.getAttribute('href'), location.href), params = url.searchParams;
      if (url.protocol !== 'https:' || !/(^|\.)vk\.(ru|com)$/.test(url.hostname)) return null;
      var owner = /^\/audios(-?\d+)\/?$/.exec(url.pathname);
      if (owner && owner[1] !== userId()) return null;
      if (!owner && !/^\/(audio|music)(\/|$)/.test(url.pathname)) return null;
      if (params.has('q') || params.has('z') || params.has('playlist_id') || (params.has('owner_id') && params.get('owner_id') !== userId())) return null;
      return url;
    } catch (_) { return null; }
  }
  function expand() {
    var b = moreButton(false), now = Date.now();
    if (!b || (pagingClick.element === b && now - pagingClick.at < 1000)) return;
    // Only the selected list's pagination, never the next recommendation block.
    pagingClick = { element: b, at: now }; b.click();
  }
  async function openFullList() {
    var b = moreButton(true); if (!b) return false;
    var u = safeMusicLink(b);
    if (b.hasAttribute('href') && !u) return false;
    if (u && u.pathname + u.search !== location.pathname + (location.search || '')) {
      var intent = {accountId:userId(), origin:location.origin, at:Date.now()};
      putSession(NAV_KEY, intent);
      putSession(ROUTE_KEY, Object.assign({}, intent, {path:u.pathname+u.search}));
      u.hash = 'deka-library=collect'; location.assign(u.href); return true;
    }
    b.click(); await new Promise(function (resolve) { setTimeout(resolve, 500); });
    return false;
  }
  var adapter = { identity: sourceId, read: read, measure: measure, scrollTo: scrollTo, total: total, busy: busy, expand: expand };
  var collector = null, collectorSource = '', interactionSource = '';
  function onProgress(p) {
    if (p.source !== scope || p.source !== sourceId() || !ownPage()) return;
    snapshot = Object.assign({}, p, { schema: CACHE_VERSION, accountId: userId(), sourcePath: ownPath(), items: Core.merge(cached.items, p.items), scanned: p.count });
    snapshot.count = snapshot.items.length; snapshot.diagnostics = diagnostics();
    if (Date.now() - lastSaved > 1000) {
      lastSaved = Date.now(); cached = Object.assign({}, snapshot, { complete: false, reason: 'partial', updatedAt: lastSaved }); persist();
    }
    emit('library', snapshot);
  }
  async function collect(timing) {
    if (loading || preparing) return;
    if (session().authenticated !== true || !ownPage()) { emit('library', viewSnapshot()); return; }
    var initialSource = sourceId(); preparing = true;
    try { if (await openFullList()) return; } finally { preparing = false; }
    if (initialSource !== sourceId() || !ownPage()) return;
    loadCache(); pinnedHost = host();
    collectorSource = sourceId();
    collector = Core.createCollector(adapter, Object.assign({}, timing || {}, { onProgress: onProgress }));
    loadCache(); loading = true; emit('library-scan', { active: true });
    try {
      var result = await collector.run();
      if (result.source !== sourceId()) return;
      cached = Object.assign({}, result, { schema: CACHE_VERSION, accountId: userId(), sourcePath: ownPath(), items: Core.saveResult(cached.items, result), updatedAt: Date.now() });
      cached.count = cached.items.length; cached.source=scope;
      snapshot = Object.assign({}, cached, { diagnostics: diagnostics() }); persist();
      emit('library', snapshot);
      // Preserve the desktop CSV interface, but expose completeness separately.
      emit('vk:collect', Object.assign({}, snapshot, { done: true, page: location.pathname }));
      emit('vk:playlist', { items: cached.items, page: location.pathname });
    } finally { loading = false; pinnedHost = null; emit('library-scan', { active: false }); }
  }
  function ownURL() {
    // Never take a profile/playlist owner or arbitrary "my music" link as the viewer's ID.
    if (!userId()) return null;
    if (ownPage()) return new URL(location.pathname + (location.search || ''), location.origin);
    var link = Array.from(document.querySelectorAll('a[href]')).find(function (n) { return shown(n) && PERSONAL.test(ownLabel(n)) && safeMusicLink(n); });
    if (link) return safeMusicLink(link);
    return new URL(ownPath(), location.origin);
  }
  var navigating = false;
  function personalEntry() {
    var preview = selection();
    var full = preview.header && moreButton(true);
    if (full && (!full.hasAttribute('href') || safeMusicLink(full))) return full;
    return Array.from(document.querySelectorAll('a[href],button,[role=tab]')).find(function (el) {
      if (!shown(el) || el.closest(SELECTOR) || marker(el)) return false;
      var label = ownLabel(el);
      if (!/^(Моя музыка|Мои треки|Мои аудиозаписи|My music|My tracks)$/i.test(label)) return false;
      return !el.hasAttribute('href') || !!safeMusicLink(el);
    }) || null;
  }
  function sourceFailure(reason) {
    loadCache(); snapshot = Object.assign({}, cached, {status:'partial', complete:false, reason:reason});
    emit('library', snapshot); return false;
  }
  async function collectMy() {
    if (loading || preparing || navigating) return false;
    if (session().authenticated !== true) { emit('library', viewSnapshot()); return false; }
    if (ownPage()) return collect();
    // Resolve the actual personal entry BEFORE the own-page gate.
    var until = Date.now() + 8000, entry;
    while (!(entry = personalEntry()) && Date.now() < until && session().authenticated === true) {
      await new Promise(function (resolve) { setTimeout(resolve, 200); });
    }
    if (!entry) return sourceFailure('personal-entry-not-found');
    loadCache();
    var preview = read();
    if (preview.length) {
      cached.items = Core.merge(cached.items, preview); cached.count = cached.items.length;
      cached.complete = false; snapshot = Object.assign({}, cached, {status:'loading',reason:'opening-personal-list'});
      persist(); emit('library', snapshot);
    }
    var link = safeMusicLink(entry), oldRoute = currentRoute(), uid = userId();
    var intent = {accountId:uid, origin:location.origin, at:Date.now()};
    putSession(NAV_KEY, intent);
    if (link && link.pathname + link.search !== oldRoute) {
      putSession(ROUTE_KEY, Object.assign({}, intent, {path:link.pathname + link.search}));
    }
    navigating = true;
    try {
      entry.click();
      until = Date.now() + 10000;
      while (Date.now() < until && userId() === uid) {
        if (ownPage() && nativeRows().length) {
          try { sessionStorage.removeItem(NAV_KEY); } catch (_) {}
          navigating = false; return collect();
        }
        await new Promise(function (resolve) { setTimeout(resolve, 200); });
      }
      return sourceFailure('personal-navigation-timeout');
    } finally { navigating = false; }
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
    var request = ++runToken; interactionSource = sourceId();
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
  function diagnostics() {
    var s = selection(), h = host();
    return { page: location.pathname, preview:!!s.preview, ownPage:ownPage(), entryFound:!!personalEntry(), personalRows: s.rows.length, excludedRows: s.excluded || 0,
      header: s.header ? ownLabel(s.header) : '', scrollTop: Math.round(h.scrollTop),
      scrollHeight: h.scrollHeight, viewport: h.clientHeight, expected: total(),
      scrollElement: h.tagName + (h.id ? '#' + h.id : ''), hasMore: !!moreButton(false) };
  }
  window.DekaLibrary = { collect: collect, collectMy: collectMy, cancel: function () { if (collector) collector.cancel(); },
    get: viewSnapshot, diagnostics: diagnostics, adapter: adapter, userId: userId, ownURL: ownURL, ownPage: ownPage, landing: landing,
    preferred: collectMy, playKey: playKey, takePendingPlay: takePendingPlay, isRunning: function () { return loading || preparing || navigating; } };
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
    var nav = sessionValue(NAV_KEY);
    if (nav && nav.accountId === userId() && nav.origin === location.origin &&
        Date.now() - nav.at >= 0 && Date.now() - nav.at < 20000) {
      var retry = function () {
        if (userId() !== nav.accountId || Date.now() - nav.at >= 20000) return;
        if (ownPage() && nativeRows().length && !loading && !preparing) {
          try { sessionStorage.removeItem(NAV_KEY); } catch (_) {}
          collect();
        } else setTimeout(retry, 200);
      };
      setTimeout(retry, 200);
    }
    var lastSource = sourceId();
    function refresh() {
      timer = null;
      if (sourceId() !== lastSource) {
        // Delayed SPA observer must not cancel NEW work for the new route.
        if (collector && collectorSource !== sourceId()) collector.cancel();
        if (!loading) { pinnedHost = null; lastScope = null; }
        if (interactionSource !== sourceId()) runToken++;
        lastSource = sourceId();
        loadCache(); emit('library', viewSnapshot());
      }
      // Never accumulate discovery/recommendations or a visited user's page as "my music".
      if (!loading && (ownPage() || selection().preview) && session().authenticated === true) {
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
      attributeFilter: ['data-audio-id','data-full-id','data-id','aria-busy','aria-selected'] });
    refresh();
    window.addEventListener('pagehide', function () { if (loading && snapshot && snapshot.items) { cached = Object.assign({}, snapshot, { complete: false, reason: 'interrupted' }); persist(); } runToken++; if (collector) collector.cancel(); observer.disconnect(); clearTimeout(timer); }, { once: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
