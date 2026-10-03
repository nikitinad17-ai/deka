/* Deka library: DOM-independent collector. Never call a timeout a complete list. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DekaLibraryCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function clean(t) {
    if (!t || typeof t.title !== 'string' || !t.title.trim()) return null;
    var title = t.title.trim().slice(0, 500), artist = String(t.artist || '').trim().slice(0, 500);
    var raw = String(t.key || ''), id = /^(-?\d+_\d+)(?:#\d+)?$/.exec(raw);
    var duration = Number.isFinite(+t.duration) ? Math.max(0, +t.duration) : 0;
    var key = id ? id[1] : 'meta:' + JSON.stringify([artist, title, duration]);
    return { key: key, title: title, artist: artist, duration: duration, section: String(t.section || '').slice(0, 200) };
  }
  function merge(previous, incoming) {
    var map = new Map();
    (previous || []).concat(incoming || []).forEach(function (t) { var c = clean(t); if (c) map.set(c.key, c); });
    return Array.from(map.values());
  }
  function saveResult(previous, result) {
    // A interrupted/failed/partial pass must not erase the previously saved tail.
    return result.complete ? merge([], result.items) : merge(previous, result.items);
  }
  function createCollector(adapter, options) {
    var opts = Object.assign({ stepMs: 450, settleMs: 800, endMs: 12000, stalledMs: 45000,
      maxMs: 20 * 60 * 1000, maxTracks: 30000, now: Date.now,
      sleep: function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); },
      onProgress: function () {} }, options || {});
    var active = null;
    async function run() {
      if (active) return active.promise;
      var token = { cancelled: false };
      active = token;
      token.promise = perform(token).finally(function () { if (active === token) active = null; });
      return token.promise;
    }
    async function perform(token) {
      var start = opts.now(), lastChange = start, bottomSince = null, signature = '', map = new Map();
      var source = adapter.identity(), initial = adapter.measure(), failure = null;
      function report(status, complete, reason, expected) {
        return { status: status, complete: !!complete, reason: reason || '', source: source,
          expected: expected || null, count: map.size, items: Array.from(map.values()) };
      }
      try {
        adapter.scrollTo(0);
        await opts.sleep(opts.settleMs);
        while (!token.cancelled) {
          if (adapter.identity() !== source) return report('partial', false, 'source-changed');
          var before = map.size;
          (adapter.read() || []).forEach(function (t) { var c = clean(t); if (c) map.set(c.key, c); });
          var now = opts.now(), m = adapter.measure(), expected = adapter.total ? adapter.total() : null;
          var bottom = m.top + m.height >= m.fullHeight - 3;
          var busy = adapter.busy ? adapter.busy() : false;
          var sig = [m.fullHeight, map.size, expected || 0].join('|');
          if (map.size !== before || sig !== signature) { lastChange = now; bottomSince = null; signature = sig; }
          var progress = report('loading', false, '', expected);
          opts.onProgress(progress);
          if (token.cancelled) return report('partial', false, 'cancelled', expected);
          if (adapter.identity() !== source) return report('partial', false, 'source-changed', expected);
          if (expected > 0 && map.size === expected && !busy) return report('complete', true, 'count-matched', expected);
          if (expected > 0 && map.size > expected) return report('partial', false, 'count-conflict', expected);
          if (bottom && !busy) {
            if (bottomSince === null) bottomSince = now;
            // With an advertised total, missing rows are an error, not "success".
            if (map.size && now - bottomSince >= opts.endMs && !expected)
              return report('complete', true, 'end-observed');
          } else bottomSince = null;
          if (now - lastChange >= opts.stalledMs)
            return report('partial', false, expected ? 'missing-tracks' : (map.size ? 'stalled' : 'no-rows'), expected);
          if (now - start >= opts.maxMs || map.size >= opts.maxTracks)
            return report('partial', false, 'limit', expected);
          if (bottom) {
            if (adapter.expand) adapter.expand();
            // Re-enter the loading sentinel without skipping a viewport of rows.
            if (expected && now - lastChange > opts.endMs / 2) {
              adapter.scrollTo(Math.max(0, m.top - 1));
              adapter.scrollTo(m.top);
            }
          } else {
            // ONLY move the actual host. scrollIntoView(oldLastRow) used to undo this step.
            adapter.scrollTo(Math.min(m.fullHeight - m.height, m.top + Math.max(1, Math.floor(m.height * 0.6))));
          }
          await opts.sleep(opts.stepMs);
        }
        return report('partial', false, 'cancelled');
      } catch (err) {
        failure = err;
        return report('partial', false, 'read-error');
      } finally {
        // Restore only the same source. Never move a newly opened playlist.
        if (adapter.identity() === source) { try { adapter.scrollTo(initial.top); } catch (_) {} }
        if (failure && opts.onError) opts.onError(failure);
      }
    }
    return { run: run, cancel: function () { if (active) active.cancelled = true; },
      isRunning: function () { return !!active; } };
  }
  return { clean: clean, merge: merge, saveResult: saveResult, createCollector: createCollector };
});
