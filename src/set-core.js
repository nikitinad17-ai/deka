/*
 * Дека · сеты из VK Видео: чистая логика без DOM.
 * Ссылки, треклист по таймкодам из описания, текущий трек сета,
 * точка продолжения и хранение позиций. Звук не сохраняется: только время и названия.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DekaSets = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var HOSTS = /(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/i;
  var MIN_RESUME = 30, END_MARGIN = 30, MAX_POSITIONS = 300, POS_KEY = 'deka:setpos';

  function fmt(sec) {
    sec = Math.max(0, Math.floor(+sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }

  // vkvideo.ru/video-1_2, vk.ru/video-1_2, vk.com/…?z=video-1_2%2F…, m.vk.ru/clip-1_2
  function parseLink(str) {
    var raw = String(str || '').trim();
    if (!raw) return null;
    if (!/^[a-z]+:\/\//i.test(raw)) raw = 'https://' + raw;
    var u; try { u = new URL(raw); } catch (_) { return null; }
    if (!/^https?:$/.test(u.protocol) || !HOSTS.test(u.hostname)) return null;
    var hay = u.pathname + ' ' + decodeURIComponent(u.search || '');
    var m = hay.match(/(?:^|[\/=\s])(video|clip)(-?\d+_\d+)(?![\w-])/);
    if (!m) return null;
    return { kind: m[1], id: m[2], url: 'https://vkvideo.ru/' + m[1] + m[2] };
  }

  // Таймкод: 1:02, 01:02, 1:02:03. Цифры вокруг не должны продолжать число.
  var TIME = /(?:^|[^\d:])((?:\d{1,2}:)?\d{1,2}:\d{2})(?![\d:])/;
  function toSeconds(t) {
    var p = String(t).split(':').map(Number);
    if (p.some(function (n) { return !isFinite(n); })) return NaN;
    if (p.length === 3) return p[1] > 59 || p[2] > 59 ? NaN : p[0] * 3600 + p[1] * 60 + p[2];
    return p[1] > 59 ? NaN : p[0] * 60 + p[1];
  }
  function cleanTitle(s) {
    return String(s || '')
      .replace(/^[\s\-–—|•·.:)\]]+/, '')
      .replace(/^\d{1,3}\s*[.)]\s+/, '')
      .replace(/[\s\-–—|•·:(\[]+$/, '')
      .replace(/\s+/g, ' ').trim().slice(0, 120);
  }
  function parseLine(line) {
    var text = String(line || '').replace(/ /g, ' ').trim();
    if (!text || text.length > 300) return null;
    // Сначала таймкод в начале строки (после номера, скобки), иначе последний в строке.
    var lead = text.match(/^(?:\d{1,3}\s*[.)]\s*)?[\[(]?\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(?![\d:])\s*[\])]?(.*)$/);
    var time, title;
    if (lead) { time = lead[1]; title = lead[2]; }
    else {
      var all = [], re = new RegExp(TIME.source, 'g'), m;
      while ((m = re.exec(text))) all.push(m);
      if (!all.length) return null;
      var last = all[all.length - 1];
      time = last[1];
      title = text.slice(0, last.index + last[0].length - last[1].length) + text.slice(last.index + last[0].length);
      title = title.replace(/[(\[]\s*[)\]]/g, '');
    }
    var sec = toSeconds(time);
    if (!isFinite(sec)) return null;
    return { time: sec, title: cleanTitle(title) };
  }
  // Самая длинная строго возрастающая цепочка: отсеивает «12:00 МСК» и длительности треков.
  function increasing(items) {
    var n = items.length, len = [], prev = [], best = -1;
    for (var i = 0; i < n; i++) {
      len[i] = 1; prev[i] = -1;
      for (var j = 0; j < i; j++) if (items[j].time < items[i].time && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
      if (best < 0 || len[i] > len[best]) best = i;
    }
    var out = [];
    for (var k = best; k >= 0; k = prev[k]) out.unshift(items[k]);
    return out;
  }
  function parseTracklist(text, duration) {
    var d = +duration || 0;
    var items = String(text || '').split(/\r?\n|<br\s*\/?>/i).map(parseLine).filter(function (t) {
      return t && (!d || t.time < d);
    });
    var list = increasing(items);
    if (list.length < 3) return [];
    return list.map(function (t, i) { return { time: t.time, title: t.title || 'Трек ' + (i + 1) }; });
  }

  function chapterAt(tracks, time) {
    var t = +time || 0, found = -1;
    for (var i = 0; i < (tracks || []).length; i++) { if (tracks[i].time <= t + 0.5) found = i; else break; }
    return found;
  }
  // Время для перехода к соседнему треку сета. Назад в первые 3 секунды трека — к предыдущему.
  function stepTime(tracks, time, dir) {
    if (!tracks || !tracks.length) return null;
    var i = chapterAt(tracks, time);
    if (dir > 0) return i + 1 < tracks.length ? tracks[i + 1].time : null;
    if (i < 0) return 0;
    if (time - tracks[i].time > 3) return tracks[i].time;
    return i > 0 ? tracks[i - 1].time : 0;
  }

  function resumePoint(saved, duration) {
    var t = +saved || 0, d = +duration || 0;
    if (t < MIN_RESUME) return 0;
    if (d && t > d - END_MARGIN) return 0;
    return Math.floor(t);
  }

  // Позиции всех сетов одним JSON: { id: { t, d, title, at } }. Старые вытесняются.
  function positions(storage, now) {
    now = now || function () { return Date.now(); };
    function load() {
      try { var v = JSON.parse(storage.getItem(POS_KEY)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; }
    }
    function save(all) {
      var ids = Object.keys(all);
      if (ids.length > MAX_POSITIONS) {
        ids.sort(function (a, b) { return (all[b].at || 0) - (all[a].at || 0); });
        ids.slice(MAX_POSITIONS).forEach(function (id) { delete all[id]; });
      }
      try { storage.setItem(POS_KEY, JSON.stringify(all)); return true; } catch (_) { return false; }
    }
    return {
      get: function (id) { var p = load()[id]; return p && isFinite(p.t) ? p : null; },
      set: function (id, t, d, title) {
        if (!id || !isFinite(t)) return false;
        var all = load(), old = all[id] || {};
        all[id] = { t: Math.floor(t), d: isFinite(d) && d > 0 ? Math.floor(d) : (old.d || 0), title: String(title || old.title || '').slice(0, 140), at: now() };
        return save(all);
      },
      clear: function (id) { var all = load(); if (!(id in all)) return true; delete all[id]; return save(all); },
      all: load
    };
  }

  return { fmt: fmt, parseLink: parseLink, parseLine: parseLine, parseTracklist: parseTracklist, toSeconds: toSeconds,
    chapterAt: chapterAt, stepTime: stepTime, resumePoint: resumePoint, positions: positions,
    MIN_RESUME: MIN_RESUME, END_MARGIN: END_MARGIN, MAX_POSITIONS: MAX_POSITIONS };
});
