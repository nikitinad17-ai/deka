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
    opts = opts || {};
    var ctx, output, compressor, safety, masterMeter, cross = 0, master = 0.8, vkSide = 'A', awake = null, destroyed = false;
    var state = {}, elements = {}, nodes = {}, vinyl = {}, preparing = {}, aborts = {};
    ['A', 'B'].forEach(function (side) { state[side] = { side: side, track: null, list: [], index: -1, paused: true, time: 0, duration: 0,
      gain: 1, eq: [0, 0, 0], generation: 0, cue: 0, pending: false, status: 'empty', error: '', rate: 1, nudge: 0, bpm: null, taps: [], keyLock: opts.keyLock === undefined ? !!opts.djMode : !!opts.keyLock, held: false, scratchStatus: 'idle' }; });
    function tell(message) { if (opts.message) opts.message(message); }
    function changed() {
      if (destroyed) return;
      if (opts.change) opts.change(state);
      var on = Object.values(state).some(function (s) { return !s.paused || s.held; });
      if (on !== awake) {
        try { if (win.DekaAndroid) win.DekaAndroid.keepAwake(on); awake = on; } catch (_) {}
      }
    }
    function vk(c) { return opts.vk ? opts.vk(c) : false; }
    function setup() {
      if (ctx) return;
      ctx = opts.context || new (win.AudioContext || win.webkitAudioContext)();
      ctx.addEventListener('statechange',function(){
        if(ctx.state==='suspended'||ctx.state==='interrupted'){
          ['A','B'].forEach(function(side){var s=state[side];if(s.track&&s.track.kind==='file'&&(!s.paused||s.held)&&!s.pending)pause(side);});
        }
      });
      output = ctx.createGain(); output.gain.value = master;
      compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = -6; compressor.ratio.value = 20;
      compressor.knee.value = 0; compressor.attack.value = 0.003; compressor.release.value = 0.1;
      safety = ctx.createWaveShaper();
      var curve = new Float32Array(4097);
      for (var i = 0; i < curve.length; i++) curve[i] = Math.max(-0.98, Math.min(0.98, i * 2 / (curve.length - 1) - 1));
      safety.curve = curve; safety.oversample = 'none';
      masterMeter = ctx.createAnalyser(); masterMeter.fftSize = 2048;
      output.connect(compressor); compressor.connect(safety); safety.connect(masterMeter);
      masterMeter.connect(opts.destination || ctx.destination);
    }
    function release(side) {
      var el = elements[side], n = nodes[side];
      if (aborts[side]) aborts[side].abort();
      if (vinyl[side]) vinyl[side].dispose();
      delete vinyl[side]; delete preparing[side]; delete aborts[side];
      state[side].held = false; state[side].scratchStatus = 'idle';
      delete elements[side]; delete nodes[side];
      if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
      if (n) { n.source.disconnect(); n.filters.forEach(function (f) { f.disconnect(); }); n.gain.disconnect(); n.meter.disconnect(); }
    }
    function audio(side) {
      if (elements[side]) return elements[side];
      setup();
      var el = new win.Audio(); el.preload = 'metadata'; el.preservesPitch = false;
      var source = ctx.createMediaElementSource(el), filters = [120, 1000, 8000].map(function (f, i) {
        var n = ctx.createBiquadFilter(); n.type = ['lowshelf', 'peaking', 'highshelf'][i]; n.frequency.value = f; n.Q.value = 0.8; return n;
      });
      var gain = ctx.createGain(), meter = ctx.createAnalyser(), p = source;
      meter.fftSize = 2048;
      filters.forEach(function (n) { p.connect(n); p = n; }); p.connect(gain); gain.connect(meter); meter.connect(output);
      nodes[side] = { source: source, gain: gain, filters: filters, meter: meter }; elements[side] = el;
      function current() { return !destroyed && elements[side] === el && state[side].track && state[side].track.kind === 'file'; }
      ['playing', 'pause', 'loadedmetadata', 'timeupdate', 'waiting', 'canplay', 'seeked'].forEach(function (event) {
        el.addEventListener(event, function () {
          if (!current()) return;
          var s = state[side];
          if (s.held) return;
          s.time = el.currentTime || 0; s.duration = Number.isFinite(el.duration) ? el.duration : 0; s.paused = el.paused;
          if (event === 'waiting') s.status = 'loading';
          else if (event === 'playing') { s.status = 'playing'; s.pending = false; }
          else if (event === 'pause') { s.status = 'paused'; s.pending = false; }
          else if (event === 'loadedmetadata' || event === 'canplay' || event === 'seeked') s.status = el.paused ? 'ready' : 'playing';
          changed();
        });
      });
      el.addEventListener('ended', function () {
        if (!current()) return;
        if (!opts.djMode) return step(side, 1, true);
        var s = state[side]; s.paused = true; s.pending = false; s.status = 'ended'; s.time = el.currentTime; changed();
      });
      el.addEventListener('error', function () {
        if (!current()) return;
        var s = state[side]; s.paused = true; s.pending = false; s.status = 'error';
        s.error = 'Файл недоступен или формат не поддерживается';
        tell(s.error + ': ' + s.track.title); changed();
      });
      apply(); rate(side); return el;
    }
    function rate(side) {
      var s = state[side], el = elements[side];
      if (el) { el.preservesPitch = s.keyLock; el.playbackRate = clamp(s.rate + s.nudge, 0.8, 1.2); }
    }
    function meter(n) {
      if (!n) return null;
      var data = new Float32Array(n.fftSize); n.getFloatTimeDomainData(data);
      var peak = 0, sum = 0;
      for (var i = 0; i < data.length; i++) { peak = Math.max(peak, Math.abs(data[i])); sum += data[i] * data[i]; }
      return { peak: peak, rms: Math.sqrt(sum / data.length) };
    }
    function apply() {
      var w = weights(cross);
      ['A', 'B'].forEach(function (side, i) {
        var s = state[side], n = nodes[side];
        if (n) { n.gain.gain.setTargetAtTime((opts.djMode ? 0.25 : 1) * s.gain * w[i], ctx.currentTime, 0.02); n.filters.forEach(function (f, j) { f.gain.setTargetAtTime(s.eq[j], ctx.currentTime, 0.02); }); }
      });
      if (output) output.gain.setTargetAtTime(master, ctx.currentTime, 0.02);
      var s = state[vkSide];
      if (s.track && s.track.kind !== 'file') {
        vk({ type: 'volume', value: clamp(master * s.gain * w[vkSide === 'A' ? 0 : 1], 0, 1) });
        vk({ type: 'fx', on: true, pre: 0, gains: [s.eq[0],s.eq[0],s.eq[0],s.eq[1],s.eq[1],s.eq[1],s.eq[1],s.eq[2],s.eq[2],s.eq[2]], filter: 0, bal: 0 });
      }
    }
    function pause(side) {
      var s = state[side];
      if (s.held) { s.held = false; if (vinyl[side]) vinyl[side].release(); if (elements[side]) elements[side].currentTime = s.time; }
      s.generation++; s.pending = false;
      if (s.track && s.track.kind === 'file') { if (elements[side]) elements[side].pause(); }
      else if (side === vkSide) vk({ type: 'pause' });
      s.paused = true; if (s.track && s.status !== 'error') s.status = 'paused'; changed();
    }
    function load(side, list, index) {
      var s = state[side]; if (!s) return;
      list = (Array.isArray(list) ? list : []).filter(function (t) { return t && t.key; });
      if (!list.length) { tell('Список пуст'); return; }
      pause(side); release(side); s.list = list.slice(); s.index = Math.floor(clamp(index, 0, list.length - 1));
      s.track = s.list[s.index]; s.time = 0; s.duration = s.track.duration || 0; s.cue = 0; s.rate = 1; s.nudge = 0; s.bpm = null; s.taps = []; s.error = ''; s.status = 'loading';
      if (s.track.kind === 'file') { var el = audio(side); el.src = s.track.url; rate(side); el.load(); }
      changed();
    }
    async function play(side) {
      var s = state[side]; if (!s || !s.track) { tell('Сначала выберите трек в списке ' + side); return; }
      if (s.held) return;
      var generation = ++s.generation; s.pending = true; s.error = ''; changed();
      try {
        if (s.track.kind === 'file') {
          var el = audio(side); await ctx.resume();
          if (generation !== s.generation) return;
          // Bypass VK's prototype hook, so local deck B is never adopted as VK audio.
          await nativePlay.call(el);
          if (generation !== s.generation || elements[side] !== el) return;
        } else {
          if (vkSide !== side) { var other = state[vkSide]; if (other.track && other.track.kind !== 'file') { other.paused = true; other.pending = false; other.generation++; tell('VK: переключён один общий поток на деку ' + side); } vkSide = side; }
          apply();
          var ok = s.track.key === 'live-vk' ? await vk({ type: 'play' }) : await vk({ type: 'playKey', key: s.track.key });
          if (ok === false) { s.pending = false; s.paused = true; tell('VK не нашёл выбранный трек. Другой трек вместо него не включён.'); }
        }
      } catch (_) { if (generation === s.generation) { s.pending = false; s.paused = true; s.status = 'error'; s.error = 'Не удалось воспроизвести файл'; tell('Не удалось запустить деку ' + side); } }
      changed();
    }
    function toggle(side) { if (state[side].paused) return play(side); pause(side); }
    function seek(side, time) {
      var s = state[side]; time = clamp(time, 0, s.duration || 0);
      if (s.track && s.track.kind === 'file' && elements[side]) elements[side].currentTime = time;
      else if (side === vkSide) vk({ type: 'seek', time: time }); s.time = time; changed();
    }
    async function scratchBegin(side) {
      var s = state[side], el = elements[side];
      if (!opts.vinyl || !win.DekaVinyl || !el || !s.track || s.status === 'error' || s.held) return false;
      var track = s.track, n = nodes[side], resume = !el.paused;
      s.generation++; s.pending = false; s.held = true; s.resumeAfterScratch = resume;
      s.time = el.currentTime; el.pause(); s.paused = true; s.status = 'held'; changed();
      try {
        await ctx.resume();
        if (!preparing[side] && !vinyl[side]) {
          s.scratchStatus = 'loading'; changed();
          var controller = new AbortController(); aborts[side] = controller;
          preparing[side] = win.DekaVinyl.prepare(ctx, track, n.filters[0], controller.signal).then(function (v) {
            if (destroyed || state[side].track !== track || controller.signal.aborted) { v.dispose(); return null; }
            vinyl[side] = v; state[side].scratchStatus = 'ready'; state[side].scratchBackend=v.backend || 'worklet'; changed(); return v;
          });
        }
        var v = vinyl[side] || await preparing[side];
        if (!v || destroyed || s.track !== track || !s.held) return false;
        v.grab(s.time); s.scratchStatus = 'ready'; changed(); return true;
      } catch (error) {
        if (s.track === track && !destroyed && error.name !== 'AbortError') {
          delete preparing[side]; s.scratchStatus = 'error'; tell(error.message || 'Не удалось подготовить скретч');
          scratchEnd(side);
        }
        return false;
      }
    }
    function scratchMove(side, seconds) {
      var s = state[side]; if (!s.held) return;
      s.time = clamp(s.time + seconds, 0, s.duration || 0);
      if (vinyl[side]) vinyl[side].move(s.time);
      changed();
    }
    function scratchEnd(side, cancel) {
      var s = state[side]; if (!s.held) return;
      var resume = s.resumeAfterScratch && !cancel && s.time < s.duration - 0.002;
      s.held = false; s.resumeAfterScratch = false;
      if (vinyl[side]) vinyl[side].release();
      if (elements[side]) elements[side].currentTime = s.time;
      s.status = 'paused'; s.paused = true; changed();
      if (resume) play(side);
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
    return { state: state, setDJMode: function (on) { opts.djMode=!!on; apply(); }, load: load, play: play, pause: pause, toggle: toggle, seek: seek, step: step,
      noteVK: noteVK, endedVK: endedVK,
      scratchBegin: scratchBegin, scratchMove: scratchMove, scratchEnd: scratchEnd,
      setKeyLock: function (side, on) { state[side].keyLock = !!on; rate(side); changed(); },
      clear: function (side) { pause(side); release(side); var s = state[side]; s.track = null; s.list = []; s.index = -1; s.time = s.duration = s.cue = 0; s.status = 'empty'; s.error = ''; changed(); },
      cue: function (side) { var s = state[side]; if (s.paused) s.cue = s.time; else { pause(side); seek(side, s.cue); } changed(); },
      setRate: function (side, value) { state[side].rate = clamp(value, 0.92, 1.08); rate(side); changed(); },
      nudge: function (side, value) { state[side].nudge = clamp(value, -0.04, 0.04); rate(side); changed(); },
      setBPM: function (side, value) { var s = state[side]; s.bpm = +value > 0 ? clamp(value, 30, 300) : null; changed(); },
      tap: function (side) { var s = state[side], now = win.performance.now();
        if (s.taps.length && now - s.taps[s.taps.length - 1] > 2000) s.taps = [];
        s.taps.push(now); if (s.taps.length > 8) s.taps.shift();
        if (s.taps.length > 1) {
          var tapped = 60000 * (s.taps.length - 1) / (now - s.taps[0]);
          // TAP follows the beat currently heard; store original BPM so the display
          // does not apply the tempo twice when tapping a deck that is already pitched.
          if (opts.djMode && !s.paused) tapped /= s.rate + s.nudge;
          s.bpm = Math.round(clamp(tapped, 30, 300) * 10) / 10;
        }
        changed(); return s.bpm;
      },
      meters: function () { return { A: meter(nodes.A && nodes.A.meter), B: meter(nodes.B && nodes.B.meter), master: meter(masterMeter) }; },
      setCross: function (x) { cross = clamp(x, -1, 1); apply(); },
      setMaster: function (x) { master = clamp(x, 0, 1); apply(); },
      setGain: function (side, x) { state[side].gain = clamp(x, 0, 1); apply(); },
      setEQ: function (side, band, value) { if (band >= 0 && band < 3) state[side].eq[band] = clamp(value, -12, 12); apply(); },
      destroy: function () { pause('A'); pause('B'); destroyed = true; release('A'); release('B'); if (ctx && !opts.context) ctx.close(); },
      diagnostics: function () { return { cross: cross, weights: weights(cross), master: master, vkSide: vkSide, localPlayers: Object.keys(elements).length }; }
    };
  }
  return { create: create, weights: weights, clamp: clamp };
});
