/* Deka's page adapter. Uses visible VK markup, not private API/audio downloads.
 *
 * «Треки VK» — это только ваш список «Мои треки». Главная страница музыки VK
 * (превью своих треков + рекомендации, новинки, чарты) в библиотеку не попадает:
 * «Загрузить всё» оттуда открывает ваш полный список и собирает его. На странице
 * списка строки под заголовками рекомендаций и других подборок отсекаются,
 * а прокрутка не уходит ниже конца вашего списка. */
(function () {
  'use strict';
  if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;
  if (window.DekaLibrary || !window.DekaLibraryCore || !window.__deka) return;
  var Core = window.DekaLibraryCore, original = window.__deka.cmd.bind(window.__deka);
  var SELECTOR = "[data-testid='MusicTrackRow'],[data-audio],.audio_item,.audio_row,[data-testid='audio-row'],[class*='AudioRow__root']";
  var HEADINGS = "h1,h2,h3,h4,[role=heading],[data-testid*=BlockHeader],[data-testid=headerlayout],.audio_block__title,.CatalogBlock__header,.page_block_h2";
  var PERSONAL = /^(мои (треки|аудиозаписи|песни)|моя (музыка|библиотека)|my (music|tracks|audio)|все (мои )?(треки|аудиозаписи)|треки|аудиозаписи|tracks)(?=\s|$|[·:(\d])/i;
  var DISCOVERY = /(рекоменд|похож|для вас|вам (?:может )?понрав|популярн|недавно (?:прослуш|играл)|вы слушали|собран[оы] для|новинк|новые релизы|чарт|в тренде|recommend|similar|for you|suggest|related|recently played|you may|you might|based on|chart|trending|new releases)/i;
  var CACHE = 'deka:library:v3:';
  var rowMap = new Map(), cached = null, scope = '', runToken = 0, loading = false, snapshot = null, timer;
  var pinnedHost = null, memo = new WeakMap(), pagingClick = { el: null, at: 0 }, collector = null, interruptedByPlay = false;

  // ---------- кто вошёл и что за страница ----------
  // vk.user бывает просматриваемым профилем, поэтому берём только vk.id/uid и cookie сессии.
  function userId() {
    var v = window.vk || {}, ids = [];
    [v.id, v.uid].forEach(function (x) { x = String(x == null ? '' : x); if (/^[1-9]\d*$/.test(x) && ids.indexOf(x) < 0) ids.push(x); });
    try { var c = document.cookie.match(/(?:^|;\s*)remixmid=(\d+)/); if (c && /^[1-9]\d*$/.test(c[1]) && ids.indexOf(c[1]) < 0) ids.push(c[1]); } catch (_) {}
    if (ids.length === 1) { remember(ids[0]); return ids[0]; }
    if (ids.length > 1) return '';
    // Мобильный VK может не отдавать id в данных страницы: ссылка «Профиль»/«Моя страница» в меню.
    var nav = navId(); if (nav) { remember(nav); return nav; }
    // Id, найденный раньше на этом сайте (сбрасывается, когда «Дека» видит, что вход не выполнен).
    try { var l = localStorage.getItem('deka:uid'); if (/^[1-9]\d*$/.test(l || '')) return l; } catch (_) {}
    return '';
  }
  function remember(id) { try { if (localStorage.getItem('deka:uid') !== id) localStorage.setItem('deka:uid', id); } catch (_) {} }
  var navCache = { at: 0, id: '' };
  function navId() {
    var now = Date.now(); if (now - navCache.at < 2000) return navCache.id;
    var found = [];
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var t = ((a.getAttribute('aria-label') || '') + ' ' + (a.textContent || '')).trim().replace(/\s+/g, ' ');
      if (!/^(моя страница|мой профиль|профиль|my profile|profile)$/i.test(t) && !/^(моя страница|мой профиль|профиль|my profile|profile) /i.test(t)) return;
      var m = /^(?:https?:\/\/(?:m\.)?vk\.(?:ru|com))?\/id(\d+)\/?$/.exec(a.getAttribute('href') || '');
      if (m && found.indexOf(m[1]) < 0) found.push(m[1]);
    });
    navCache = { at: now, id: found.length === 1 ? found[0] : '' };
    return navCache.id;
  }
  function query() { try { return new URLSearchParams(location.search || ''); } catch (_) { return new URLSearchParams(''); } }
  // personal — ваш полный список; list — конкретный плейлист/чужой список/прочая страница со строками;
  // landing — главная музыки, обзор, поиск; other — VK Видео.
  // Адрес полного списка «Мои треки», куда ведёт «Показать все» своего раздела (у VK он бывает любым).
  function fullKey() { return 'deka:fullList:' + (userId() || 'unknown'); }
  function fullUrl() { try { return localStorage.getItem(fullKey()) || ''; } catch (_) { return ''; } }
  function here() { return location.pathname + (location.search || ''); }
  function pageKind() {
    var path = location.pathname.replace(/\/+$/, '') || '/', q = query(), uid = userId();
    if (/vkvideo\.ru$/.test(location.hostname) || /^\/(video|clip)/.test(path)) return 'other';
    var full = fullUrl(); if (full && here() === full) return 'personal';
    if (q.has('q')) return 'landing';
    if (q.has('z') && /audio_playlist|playlist/.test(q.get('z') || '')) return 'list';
    var own = /^\/audios(-?\d+)$/.exec(path);
    if (own) return uid && own[1] === uid ? 'personal' : 'list';
    if (/^\/(music\/(playlist|album)|playlist|audio_playlist)/.test(path) || q.has('playlist_id') || /playlist/.test(q.get('act') || '')) return 'list';
    if (/^\/(audio|music)(\/|$)/.test(path)) {
      var section = q.get('section') || q.get('act') || '';
      if (uid && /^\/(audio|music)(\/(my|my_music|tracks))?$/.test(path) && (/^(my|my_music|all|tracks)$/.test(section) || /\/(my|my_music|tracks)$/.test(path))) return 'personal';
      return 'landing';
    }
    return 'list';
  }
  function pageId() { return (userId() || 'unknown') + '|' + location.pathname + (location.search || ''); }
  function storeScope() { return (userId() || 'unknown') + '|' + (pageKind() === 'list' ? location.pathname + (location.search || '') : 'own'); }
  function writable() { var k = pageKind(); return k === 'personal' || k === 'list'; }

  // ---------- кэш ----------
  function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function loadCache() {
    var key = storeScope();
    if (scope === key && cached) return;
    scope = key;
    cached = readStore(CACHE + scope, { items: [], complete: false, reason: 'not-loaded' });
    cached.items = Core.merge([], Array.isArray(cached.items) ? cached.items : []);
    snapshot = Object.assign({}, cached, { count: cached.items.length, source: scope, status: 'saved' });
    if (!writable() && !cached.items.length) snapshot.reason = 'open-own-library';
  }
  function persist() {
    if (!writable()) return; // с главной и из рекомендаций в библиотеку ничего не пишем
    try { localStorage.setItem(CACHE + scope, JSON.stringify(cached)); }
    catch (_) { snapshot.storageError = true; }
  }
  function emit(name, data) {
    window.dispatchEvent(new CustomEvent('deka:' + name, { detail: data }));
    try {
      var p = window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.emitTo('main', name, data);
      if (p && p.catch) p.catch(function () {});
    } catch (_) {}
  }

  // ---------- строки и разделы страницы ----------
  function shown(n) { return !!(n && n.isConnected && n.getClientRects().length && !n.closest('[hidden],[aria-hidden="true"]')); }
  function label(n) { return String((n && n.textContent) || '').trim().replace(/\s+/g, ' ').slice(0, 120); }
  function text(el, selectors) {
    for (var i = 0; i < selectors.length; i++) { var n = el.querySelector(selectors[i]); if (n && n.textContent.trim()) return n.textContent.trim(); }
    return '';
  }
  function allRows() {
    return Array.from(document.querySelectorAll(SELECTOR)).filter(function (r) {
      if (!r.getClientRects().length) return false;
      if (!r.matches("[data-testid='MusicTrackRow']") && r.querySelector("[data-testid='MusicTrackRow']")) return false;
      // Вложенная строка внутри другой «строки»-обёртки без MusicTrackRow — берём только внешнюю.
      for (var a = r.parentElement && r.parentElement.closest(SELECTOR); a; a = a.parentElement && a.parentElement.closest(SELECTOR))
        if (!a.querySelector("[data-testid='MusicTrackRow']")) return false;
      return true;
    });
  }
  // Контейнер, помеченный как рекомендации (класс, data-testid, aria-label).
  function marked(n) {
    if (!n || n === document.body || n === document.documentElement || !n.getAttribute) return false;
    var token = [n.id, String(n.className || ''), n.getAttribute('data-testid'), n.getAttribute('data-section'), n.getAttribute('aria-label')].join(' ');
    return DISCOVERY.test(token);
  }
  function headingIn(node) {
    if (!node || !shown(node) || node.matches(SELECTOR)) return null;
    if (node.matches(HEADINGS)) return node;
    if (node.querySelector(SELECTOR)) return null; // соседний блок со своими треками — не наш заголовок
    var hs = node.querySelectorAll(HEADINGS);
    for (var i = 0; i < hs.length; i++) if (shown(hs[i])) return hs[i];
    return null;
  }
  // Раздел строки: ближайший ПРЕДШЕСТВУЮЩИЙ заголовок, а не первый попавшийся у общего предка.
  // Строки идут по порядку документа, поэтому ответ для предыдущего соседа (уже посчитанный) переиспользуем:
  // длинный плоский список из тысяч строк обходится за линейное время.
  function boundary(el) {
    if (memo.has(el)) return memo.get(el);
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (marked(p)) { var rec = { node: p, label: 'рекомендации', recommendation: true }; memo.set(el, rec); return rec; }
    }
    var found = null, chain = [];
    outer:
    for (var cur = el, depth = 0; cur && cur !== document.body && depth < 25; cur = cur.parentElement, depth++) {
      chain.push(cur);
      for (var prev = cur.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (memo.has(prev) && !marked(prev)) { found = memo.get(prev); break outer; }
        if (marked(prev) && prev.querySelector(SELECTOR)) continue;
        var h = headingIn(prev);
        if (h) { var l = label(h); found = { node: h, label: l, recommendation: DISCOVERY.test(l) }; break outer; }
      }
      var aria = cur !== el && cur.getAttribute && cur.getAttribute('aria-label');
      if (aria && (PERSONAL.test(aria) || DISCOVERY.test(aria))) { found = { node: cur, label: aria, recommendation: DISCOVERY.test(aria) }; break; }
    }
    found = found || { node: null, label: '', recommendation: false };
    chain.forEach(function (c) { memo.set(c, found); });
    return found;
  }
  // Какие строки — «наш» список: первый раздел страницы, который не рекомендации.
  function selection() {
    memo = new WeakMap();
    var all = allRows(), entries = all.map(function (r) { return { row: r, b: boundary(r) }; });
    // Явный раздел «Мои треки»/«Треки» важнее безымянных строк выше него.
    var first = entries.find(function (e) { return !e.b.recommendation && PERSONAL.test(e.b.label); }) ||
      entries.find(function (e) { return !e.b.recommendation; });
    // Плейлист может называться «Новинки осени»: если на странице списка других разделов нет, берём первый.
    if (!first && pageKind() === 'list') first = entries[0];
    var chosen = entries.filter(function (e) { return first && e.b.node === first.b.node; });
    return { all: all, entries: entries, rows: chosen.map(function (e) { return e.row; }), node: first ? first.b.node : null,
      label: first ? first.b.label : '', excluded: entries.length - chosen.length };
  }
  function parseDur(t) { var m = String(t || '').match(/(\d+):(\d{2})(?::(\d{2}))?/); return m ? (m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]) : 0; }
  function describe(r, sectionLabel) {
    var data = null;
    try { data = JSON.parse(r.getAttribute('data-audio')); } catch (_) {}
    var holder = r.closest('[data-audio-id],[data-full-id]');
    var key = holder ? (holder.getAttribute('data-audio-id') || holder.getAttribute('data-full-id')) : r.getAttribute('data-id');
    var title = text(r, ["[data-testid='MusicTrackRow_Title']", '.audio_row__title_inner', '.ai_title', '[class*=Title]', '[class*=title]']);
    var artist = text(r, ["[data-testid='MusicTrackRow_Authors']", '.audio_row__performers', '.ai_artist', '[class*=Performer]', '[class*=artist]']);
    var dur = parseDur(text(r, ["[data-testid='MusicTrackRow_Duration']", '.audio_row__duration', '.ai_dur', '[class*=duration]']));
    if (Array.isArray(data) && data.length >= 6) { key = data[1] + '_' + data[0]; title = title || data[3]; artist = artist || data[4]; dur = +data[5] || dur; }
    var numeric = /^(?:audio)?(-?\d+_\d+)(?:#\d+)?$/.exec(String(key || '')); if (numeric) key = numeric[1];
    return Core.clean({ key: key, title: title, artist: artist, duration: dur, section: sectionLabel || '' });
  }
  // filtered: только свой список (для библиотеки); иначе все строки страницы (поиск трека, экспорт CSV).
  function read(all) {
    rowMap.clear();
    if (all) memo = new WeakMap();
    var s = all ? null : selection(), rows = s ? s.rows : allRows();
    return rows.map(function (r) {
      var t = describe(r, s ? s.label : boundary(r).label);
      if (t) rowMap.set(t.key, r);
      return t;
    }).filter(Boolean);
  }

  // ---------- прокрутка ----------
  function host() {
    if (loading && pinnedHost && pinnedHost.isConnected) return pinnedHost;
    var first = selection().rows[0] || allRows()[0], candidate = null, h = null;
    for (var p = first && first.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      var s = getComputedStyle(p);
      // overflow:hidden — это обрезанное превью, а не прокручиваемый список.
      if (/^(auto|scroll|overlay)$/.test(s.overflowY) && p.clientHeight > 0) {
        if (!candidate) candidate = p;
        if (p.scrollHeight > p.clientHeight + 2) { h = p; break; }
      }
    }
    h = h || candidate || document.scrollingElement || document.documentElement;
    if (loading && first) pinnedHost = h;
    return h;
  }
  function isDoc(h) { return h === document.scrollingElement || h === document.documentElement || h === document.body; }
  function measure() {
    var h = host(), height = h.clientHeight || innerHeight, full = h.scrollHeight, s = selection();
    // Если ниже нашего списка в той же прокрутке идут рекомендации, «дно» — это конец нашего списка
    // (вместе с местом под подгрузку), а не конец бесконечной ленты чужих треков.
    if (s.rows.length && s.excluded) {
      var last = s.rows[s.rows.length - 1], top = isDoc(h) ? 0 : h.getBoundingClientRect().top + h.clientTop;
      var below = s.entries.some(function (e) { return s.rows.indexOf(e.row) < 0 && e.row.getBoundingClientRect().top >= last.getBoundingClientRect().bottom - 1; });
      if (below) full = Math.min(full, Math.max(height, Math.ceil(h.scrollTop + last.getBoundingClientRect().bottom - top + 160)));
    }
    return { top: h.scrollTop, height: height, fullHeight: full };
  }
  function scrollTo(top) { var h = host(); h.scrollTop = Math.max(0, top); (isDoc(h) ? window : h).dispatchEvent(new Event('scroll')); }
  function busy() {
    var h = host();
    if (h.matches && h.matches('[aria-busy=true]')) return true;
    return Array.from(h.querySelectorAll('[aria-busy=true],[role=progressbar]')).some(function (n) { return n.getClientRects().length && !boundary(n).recommendation; });
  }
  function total() {
    var s = selection(); if (!s.rows.length) return null;
    var h = host(), nodes = [h].concat(Array.from(h.querySelectorAll('[aria-rowcount],[data-total-count],.audio_page__count,[data-testid=MusicTracksCount]')));
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      // Счётчик общего блока, внутри которого есть и чужие строки, не годится.
      if (s.entries.some(function (e) { return n.contains(e.row) && s.rows.indexOf(e.row) < 0; })) continue;
      var raw = n.getAttribute && (n.getAttribute('aria-rowcount') || n.getAttribute('data-total-count'));
      if (!raw && n.matches && n.matches('.audio_page__count,[data-testid=MusicTracksCount]')) raw = n.textContent.replace(/[\s ]/g, '');
      if (/^\d+$/.test(raw || '') && +raw > 0 && +raw < 1000000) return +raw;
    }
    // «Мои треки · 245», «Треки 245»
    if (s.node && PERSONAL.test(s.label)) {
      var m = s.label.match(/(?:\(|·|:|\s)\s*(\d[\d\s ]*)\)?$/);
      if (m) { var c = +m[1].replace(/[\s ]/g, ''); if (c > 0 && c < 1000000) return c; }
    }
    return null;
  }
  // «Показать ещё» только своего списка, а не следующей подборки.
  function moreButton(full) {
    var s = selection(); if (!s.node) return null;
    var re = full ? /^(показать|посмотреть|смотреть|открыть)?\s*(все|всё|все треки|все мои треки|show all|see all|view all)$/i
                  : /^(показать|загрузить)?\s*(ещ[её]|больше)$|^(show|load) more$/i;
    return Array.from(document.querySelectorAll('a,button,[role=button],.audio_more,.show_more')).find(function (el) {
      if (!shown(el) || el.closest(SELECTOR) || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      if (!re.test(label(el).replace(/[·:()\d]/g, '').trim())) return false;
      var b = boundary(el); return !b.recommendation && b.node === s.node;
    }) || null;
  }
  function expand() {
    var b = moreButton(false), now = Date.now();
    if (!b || (pagingClick.el === b && now - pagingClick.at < 1500)) return;
    var href = b.getAttribute('href');
    if (href && href !== '#' && !/^javascript:/i.test(href)) return; // это переход, а не догрузка
    pagingClick = { el: b, at: now }; b.click();
  }
  var adapter = { identity: pageId, read: function () { return read(false); }, measure: measure, scrollTo: scrollTo, total: total, busy: busy, expand: expand };

  // ---------- сбор ----------
  function ownURL() {
    var uid = userId();
    if (uid) return new URL('/audios' + uid, location.origin);
    // Без id: ссылка на /audios<id> из раздела «Мои треки» (или подписанная так) — это ваш список.
    memo = new WeakMap();
    var ids = [];
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (_) { return; }
      var m = /^\/audios(\d+)\/?$/.exec(u.pathname);
      if (!m || !/(^|\.)vk\.(ru|com)$/.test(u.hostname) || u.searchParams.has('z')) return;
      var b = boundary(a);
      if ((PERSONAL.test(label(a)) || PERSONAL.test(b.label)) && !b.recommendation && ids.indexOf(m[1]) < 0) ids.push(m[1]);
    });
    if (ids.length !== 1) return null;
    remember(ids[0]);
    return new URL('/audios' + ids[0], location.origin);
  }
  // Список свёрнут в превью со ссылкой «Показать все» на ваш же полный список — открываем его.
  // Ссылка на полный список своего раздела: «Показать все»/«Все треки» или сам заголовок «Мои треки ›».
  function fullListLink() {
    var s = selection(); if (!s.node) return null;
    var b = moreButton(true);
    if (!b) {
      var h = s.node.closest && s.node.closest('a[href]');
      if (!h && s.node.querySelector) h = s.node.querySelector('a[href]');
      if (!h && s.node.parentElement) h = Array.from(s.node.parentElement.querySelectorAll('a[href]')).find(function (a) { return !a.closest(SELECTOR) && boundary(a).node === s.node; }) || null;
      b = h;
    }
    return b;
  }
  // Превью «Мои треки» (несколько строк) — сначала открываем полный список. Переходы не по кругу.
  async function openFullList() {
    var b = fullListLink(); if (!b) return false;
    var href = b.getAttribute('href'), same = false;
    try { var t = new URL(href || '', location.href); same = t.pathname + t.search === location.pathname + location.search; } catch (_) {}
    // Кнопка без адреса или ссылка на эту же страницу: VK разворачивает список у себя — нажимаем.
    if (!href || href === '#' || /^javascript:/i.test(href) || same) {
      // Кнопка разворачивает список на месте.
      b.click();
      await new Promise(function (r) { setTimeout(r, 1200); });
      return false; // дальше собираем то, что развернулось (или новую страницу без перезагрузки)
    }
    try {
      var u = new URL(href, location.href);
      if (!/(^|\.)vk\.(ru|com)$/.test(u.hostname) || !/^\/(audios?|music)/.test(u.pathname)) return false;
      var own = /^\/audios(\d+)\/?$/.exec(u.pathname); if (own && userId() && own[1] !== userId()) return false;
      if (u.pathname + u.search === location.pathname + location.search) return false;
      if (window.__dekaLog) window.__dekaLog('«Показать все» → ' + u.pathname.replace(/\d+/g, '#') + (u.search ? '?' + Array.from(u.searchParams.keys()).join('&') : ''));
      var hops = []; try { hops = JSON.parse(sessionStorage.getItem('deka:fullHops')) || []; } catch (_) {}
      hops = hops.filter(function (t) { return Date.now() - t < 60000; });
      if (hops.length >= 2) return false;
      hops.push(Date.now()); try { sessionStorage.setItem('deka:fullHops', JSON.stringify(hops)); } catch (_) {}
      // Метка «это полный список»: страница по ссылке из своего раздела — ваш список, какой бы ни был адрес.
      u.hash = 'deka-library=collect-full'; location.assign(u.href); return true;
    } catch (_) { return false; }
  }
  function onProgress(p) {
    if (p.source !== pageId()) return;
    snapshot = Object.assign({}, p, { source: scope, items: Core.merge(cached.items, p.items), scanned: p.count });
    snapshot.count = snapshot.items.length;
    emit('library', snapshot);
  }
  async function collect(timing) {
    if (loading) return;
    if (!writable()) return collectMy(); // с главной/обзора/видео — сразу к своему списку
    if (pageKind() === 'personal' && fullUrl() && here() !== fullUrl()) { location.assign(location.origin + fullUrl() + '#deka-library=collect'); return; }
    // VK дорисовывает страницу после загрузки: ждём строки, иначе «Показать все» ещё не видно.
    for (var w = 0; w < 30 && !allRows().length; w++) await new Promise(function (r) { setTimeout(r, 200); });
    if (pageKind() === 'personal' && await openFullList()) return;
    collector = Core.createCollector(adapter, Object.assign({}, timing || {}, { onProgress: onProgress }));
    loadCache(); loading = true; pinnedHost = null; runToken++;
    var started = pageId();
    try {
      var result = await collector.run();
      if (result.reason === 'cancelled' && interruptedByPlay) result.reason = 'interrupted';
      interruptedByPlay = false;
      if (result.source !== pageId() || started !== pageId()) return;
      cached = Object.assign({}, result, { source: scope, items: Core.saveResult(cached.items, result), updatedAt: Date.now() });
      cached.count = cached.items.length;
      snapshot = Object.assign({}, cached); persist();
      emit('library', snapshot);
      emit('vk:collect', Object.assign({}, snapshot, { done: true, page: location.pathname }));
      emit('vk:playlist', { items: cached.items, page: location.pathname });
    } finally { loading = false; pinnedHost = null; }
  }
  // Экспорт CSV на компьютере: вся текущая страница как есть, в библиотеку не пишется.
  async function collectPage() {
    if (loading) return;
    var pageAdapter = Object.assign({}, adapter, { read: function () { return read(true); }, total: function () { return null; },
      measure: function () { var h = host(); return { top: h.scrollTop, height: h.clientHeight || innerHeight, fullHeight: h.scrollHeight }; } });
    collector = Core.createCollector(pageAdapter, { onProgress: function (p) { emit('vk:collect', { done: false, count: p.count }); } });
    loading = true; pinnedHost = null;
    try {
      var r = await collector.run();
      emit('vk:collect', { done: true, count: r.count, items: r.items, page: location.pathname, complete: r.complete, reason: r.reason });
    } finally { loading = false; pinnedHost = null; }
  }
  function collectMy() {
    if (pageKind() === 'personal' && (!fullUrl() || here() === fullUrl())) return collect();
    // Полный список уже известен — сразу туда, минуя превью.
    var known = fullUrl();
    if (known) { location.assign(location.origin + known + '#deka-library=collect'); return; }
    var u = ownURL();
    if (!u && !/^\/(audio|music)\/?$/.test(location.pathname)) {
      // Не видно, где ваш список: идём на главную музыки VK, там есть «Мои треки», и продолжаем оттуда.
      location.assign(location.origin + '/audio#deka-library=collect'); return;
    }
    if (!u) { emit('library', Object.assign({}, snapshot, { status: 'partial', complete: false, reason: 'choose-library' })); return; }
    u.hash = 'deka-library=collect'; // переживает переход vk.ru -> m.vk.ru, sessionStorage — нет
    location.assign(u.href);
  }
  async function playKey(key) {
    var target = String(key), numeric = /^(-?\d+_\d+)(?:#\d+)?$/.exec(target); if (numeric) target = numeric[1];
    // Трек уже на экране — просто включаем, загрузку списка не трогаем.
    read(true);
    var visible = rowMap.get(target);
    if (visible && visible.isConnected) {
      var vb = visible.querySelector("[data-testid='audiorow-tappable'],.audio_row__play_btn,.ai_play,.ai_body,[aria-label*='оспроизв']");
      (vb || visible).click(); return true;
    }
    var request = ++runToken;
    if (collector && loading) { interruptedByPlay = true; collector.cancel(); }
    while (loading) await new Promise(function (r) { setTimeout(r, 50); });
    var oldPage = pageId(), start = Date.now();
    read(true);
    if (!rowMap.has(target)) { scrollTo(0); await new Promise(function (r) { setTimeout(r, 500); }); }
    while (request === runToken && oldPage === pageId() && Date.now() - start < 90000) {
      read(true); var row = rowMap.get(target);
      if (row && row.isConnected) {
        var button = row.querySelector("[data-testid='audiorow-tappable'],.audio_row__play_btn,.ai_play,.ai_body,[aria-label*='оспроизв']");
        (button || row).click(); return true;
      }
      var h = host(), m = { top: h.scrollTop, height: h.clientHeight || innerHeight, fullHeight: h.scrollHeight };
      if (m.top + m.height >= m.fullHeight - 3 && !busy()) break;
      scrollTo(m.top + Math.max(1, Math.floor(m.height * 0.6)));
      await new Promise(function (r) { setTimeout(r, 350); });
    }
    if (request === runToken) emit('vk:linkfail', { id: target, queue: true });
    return false;
  }

  // ---------- отчёт о странице: без названий треков, id и ссылок ----------
  function mask(s) { return String(s || '').replace(/\d/g, '#').slice(0, 60); }
  function report() {
    var s = selection(), h = host(), m = measure(), sections = {};
    s.entries.forEach(function (e) {
      var k = (e.b.recommendation ? '✕ ' : s.rows.indexOf(e.row) >= 0 ? '✓ ' : '· ') + (mask(e.b.label) || '(без заголовка)');
      sections[k] = (sections[k] || 0) + 1;
    });
    var q = query(), keys = []; q.forEach(function (_, k) { if (keys.indexOf(k) < 0) keys.push(k); });
    var hostDesc = isDoc(h) ? 'document' : h.tagName.toLowerCase() + (h.getAttribute('data-testid') ? '[' + h.getAttribute('data-testid') + ']' : '') +
      (h.className ? '.' + String(h.className).trim().split(/\s+/).slice(0, 2).join('.') : '');
    var l = snapshot || {};
    return {
      deka: '0.10.7', site: location.hostname, page: mask(location.pathname) + (keys.length ? '?' + keys.join('&') : ''),
      kind: pageKind(), signedIn: !!userId(), rowsOnPage: s.all.length, chosen: s.rows.length, sections: sections,
      fullList: fullUrl() ? mask(fullUrl().split('?')[0]) + (fullUrl().indexOf('?') >= 0 ? '?' + Array.from(new URLSearchParams(fullUrl().split('?')[1]).keys()).join('&') : '') : '',
      showAllTo: (function () { var b = fullListLink(), h = b && b.getAttribute('href'); if (!b) return ''; if (!h) return 'кнопка'; try { var u = new URL(h, location.href); return mask(u.pathname) + (u.search ? '?' + Array.from(u.searchParams.keys()).join('&') : '') + (u.pathname + u.search === here() ? ' (эта же)' : ''); } catch (_) { return '?'; } })(),
      scroller: mask(hostDesc), metrics: m, expected: total(), more: !!moreButton(false), showAll: !!moreButton(true),
      library: { count: l.count || 0, status: l.status || '', complete: !!l.complete, reason: l.reason || '', expected: l.expected || null }
    };
  }

  window.__deka.cmd = function (c) {
    c = c || {};
    if (c.type === 'collectMy') return collectMy();
    if (c.type === 'collectAll') return collectPage();
    if (c.type === 'cancelCollect') { if (collector) collector.cancel(); return; }
    if (c.type === 'playRow' && !/^(-?\d+_\d+|meta:)/.test(String(c.key))) return original(c);
    if (c.type === 'playKey' || c.type === 'playRow') return playKey(c.key);
    if (c.type === 'pause' || c.type === 'stop') runToken++;
    return original(c);
  };
  window.DekaLibrary = { collect: collect, collectMy: collectMy, cancel: function () { if (collector) collector.cancel(); },
    get: function () { loadCache(); return snapshot; }, adapter: adapter, report: report, pageKind: pageKind, userId: userId,
    playKey: playKey, isRunning: function () { return loading; } };
  // Retire the old same-origin-only flag before the old bridge's DOMContentLoaded callback.
  try { sessionStorage.removeItem('dekaCollect'); } catch (_) {}
  function boot() {
    loadCache(); emit('library', snapshot);
    if (/deka-library=collect-full/.test(location.hash)) {
      // Пришли по «Показать все» своего раздела: запоминаем этот адрес как полный список «Мои треки».
      try { localStorage.setItem(fullKey(), here()); } catch (_) {}
      scope = ''; cached = null; loadCache(); emit('library', snapshot);
    }
    if (/deka-library=collect/.test(location.hash)) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
      collect();
    }
    var lastPage = pageId();
    new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (pageId() !== lastPage) { if (collector) collector.cancel(); runToken++; lastPage = pageId(); loadCache(); emit('library', snapshot); }
        // Пассивно копим только свой список или открытый плейлист. Никогда не сжимаем до видимых строк.
        if (!loading && writable()) {
          var found = read(false), merged = Core.merge(cached.items, found);
          if (merged.length !== cached.items.length) {
            cached.items = merged; cached.complete = false; cached.reason = 'partial';
            snapshot = Object.assign({}, cached, { status: 'saved', count: merged.length, expected: total(), source: scope });
            persist(); emit('library', snapshot);
          }
        }
      }, 300);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
