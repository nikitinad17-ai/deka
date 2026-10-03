/* Two real file players; VK remains one explicitly shared stream. Load BEFORE vk-bridge.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.DekaDecks = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (win) {
  'use strict';
  var nativePlay = win && win.HTMLMediaElement.prototype.play;
  function clamp(n, a, b) { n = +n; return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a; }
  function weights(x) { x = clamp(x, -1, 1); return [Math.cos((x + 1) * Math.PI / 4), Math.sin((x + 1) * Math.PI / 4)]; }
  function create(opts) {
    var ctx, output, compressor, cross = 0, master = 0.8, vkSide = 'A', awake = null, destroyed = false;
    var state = {}, elements = {}, nodes = {}, listeners = [];
    ['A', 'B'].forEach(function (side) { state[side] = { side: side, track: null, list: [], index: -1, paused: true, time: 0, duration: 0,
      gain: 1, eq: [0, 0, 0], generation: 0, cue: 0, pending: false }; });
    function tell(message) { if (opts.message) opts.message(message); }
    function changed() {
      if (destroyed) return;
      if (opts.change) opts.change(state);
      var on = Object.values(state).some(function (s) { return !s.paused; });
      if (on !== awake) {
        try { if (win.DekaAndroid) win.DekaAndroid.keepAwake(on); awake = on; } catch (_) {}
      }
    }
    function vk(c) { return opts.vk(c); }
    function setup() {
      if (ctx) return;
      ctx = new (win.AudioContext || win.webkitAudioContext)();
      output = ctx.createGain(); output.gain.value = master;
      compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = -3; compressor.ratio.value = 12;
      compressor.connect(output); output.connect(ctx.destination);
    }
    function audio(side) {
      if (elements[side]) return elements[side];
      setup();
      var el = new win.Audio(); el.preload = 'metadata';
      var source = ctx.createMediaElementSource(el), filters = [120, 1000, 8000].map(function (f, i) {
        var n = ctx.createBiquadFilter(); n.type = ['lowshelf', 'peaking', 'highshelf'][i]; n.frequency.value = f; n.Q.value = 0.8; return n;
      });
      var gain = ctx.createGain(), p = source;
      filters.forEach(function (n) { p.connect(n); p = n; }); p.connect(gain); gain.connect(compressor);
      nodes[side] = { gain: gain, filters: filters }; elements[side] = el;
      ['playing', 'pause', 'loadedmetadata', 'timeupdate'].forEach(function (event) {
        el.addEventListener(event, function () {
          var s = state[side]; if (!s.track || s.track.kind !== 'file') return;
          s.time = el.currentTime || 0; s.duration = Number.isFinite(el.duration) ? el.duration : 0; s.paused = el.paused; s.pending = false; changed();
        });
      });
      el.addEventListener('ended', function () { step(side, 1, true); });
      el.addEventListener('error', function () { state[side].paused = true; state[side].pending = false; tell('Файл не воспроизводится: ' + (state[side].track || {}).title); changed(); });
      apply(); return el;
    }
    function apply() {
      var w = weights(cross);
      ['A', 'B'].forEach(function (side, i) {
        var s = state[side], n = nodes[side];
        if (n) { n.gain.gain.setTargetAtTime(s.gain * w[i], ctx.currentTime, 0.02); n.filters.forEach(function (f, j) { f.gain.setTargetAtTime(s.eq[j], ctx.currentTime, 0.02); }); }
      });
      if (output) output.gain.setTargetAtTime(master, ctx.currentTime, 0.02);
      var s = state[vkSide];
      if (s.track && s.track.kind !== 'file') {
        vk({ type: 'volume', value: clamp(master * s.gain * w[vkSide === 'A' ? 0 : 1], 0, 1) });
        vk({ type: 'fx', on: true, pre: 0, gains: [s.eq[0],s.eq[0],s.eq[0],s.eq[1],s.eq[1],s.eq[1],s.eq[1],s.eq[2],s.eq[2],s.eq[2]], filter: 0, bal: 0 });
      }
    }
    function pause(side) {
      var s = state[side]; s.generation++; s.pending = false;
      if (s.track && s.track.kind === 'file') { if (elements[side]) elements[side].pause(); }
      else if (side === vkSide) vk({ type: 'pause' });
      s.paused = true; changed();
    }
    function load(side, list, index) {
      var s = state[side]; if (!s) return;
      list = (Array.isArray(list) ? list : []).filter(function (t) { return t && t.key; });
      if (!list.length) { tell('Список пуст'); return; }
      pause(side); s.list = list.slice(); s.index = Math.floor(clamp(index, 0, list.length - 1));
      s.track = s.list[s.index]; s.time = 0; s.duration = s.track.duration || 0; s.cue = 0;
      if (s.track.kind === 'file') { var el = audio(side); el.src = s.track.url; el.load(); }
      changed();
    }
    async function play(side) {
      var s = state[side]; if (!s || !s.track) { tell('Сначала выберите трек в списке ' + side); return; }
      var generation = ++s.generation; s.pending = true;
      try {
        if (s.track.kind === 'file') {
          var el = audio(side); await ctx.resume();
          if (generation !== s.generation) return;
          // Bypass VK's prototype hook, so local deck B is never adopted as VK audio.
          await nativePlay.call(el);
        } else {
          if (vkSide !== side) { var other = state[vkSide]; if (other.track && other.track.kind !== 'file') { other.paused = true; other.pending = false; other.generation++; tell('VK: переключён один общий поток на деку ' + side); } vkSide = side; }
          apply();
          var ok = s.track.key === 'live-vk' ? await vk({ type: 'play' }) : await vk({ type: 'playKey', key: s.track.key });
          if (ok === false) { s.pending = false; s.paused = true; tell('VK не нашёл выбранный трек. Другой трек вместо него не включён.'); }
        }
      } catch (_) { if (generation === s.generation) { s.pending = false; s.paused = true; tell('Не удалось запустить деку ' + side); } }
      changed();
    }
    function toggle(side) { if (state[side].paused) return play(side); pause(side); }
    function seek(side, time) {
      var s = state[side]; time = clamp(time, 0, s.duration || 0);
      if (s.track && s.track.kind === 'file' && elements[side]) elements[side].currentTime = time;
      else if (side === vkSide) vk({ type: 'seek', time: time }); s.time = time; changed();
    }
    function step(side, direction, ended) {
      var s = state[side]; if (!s.list.length) return;
      var index = s.index + direction;
      if (index < 0 || index >= s.list.length) { if (ended) pause(side); return; }
      load(side, s.list, index); return play(side);
    }
    function noteVK(data) {
      var s = state[vkSide];
      if (!s.track || s.track.kind === 'file') {
        // Playback started in the visible VK page, not a deck. Adopt it explicitly.
        if (!data.paused && data.title && !s.track) s.track = { key: 'live-vk', title: data.title, artist: data.artist, kind: 'vk' }; else return;
      }
      s.time = +data.currentTime || 0; s.duration = +data.duration || 0;
      s.paused = !!data.paused;
      if (!data.paused && data.title === s.track.title) s.pending = false;
      changed();
    }
    function endedVK() {
      var side = vkSide, s = state[side], index = s.index + 1, generation = s.generation;
      setTimeout(function () { if (!destroyed && generation === s.generation && s.list[index]) { load(side, s.list, index); play(side); } }, 150);
    }
    return { state: state, load: load, play: play, pause: pause, toggle: toggle, seek: seek, step: step,
      noteVK: noteVK, endedVK: endedVK,
      cue: function (side) { var s = state[side]; if (s.paused) s.cue = s.time; else { pause(side); seek(side, s.cue); } changed(); },
      setCross: function (x) { cross = clamp(x, -1, 1); apply(); },
      setMaster: function (x) { master = clamp(x, 0, 1); apply(); },
      setGain: function (side, x) { state[side].gain = clamp(x, 0, 1); apply(); },
      setEQ: function (side, band, value) { if (band >= 0 && band < 3) state[side].eq[band] = clamp(value, -12, 12); apply(); },
      destroy: function () { pause('A'); pause('B'); destroyed = true; Object.values(elements).forEach(function (a) { a.removeAttribute('src'); a.load(); }); if (ctx) ctx.close(); },
      diagnostics: function () { return { cross: cross, weights: weights(cross), master: master, vkSide: vkSide, localPlayers: Object.keys(elements).length }; }
    };
  }
  return { create: create, weights: weights, clamp: clamp };
});
