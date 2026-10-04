/* Two real file players; VK remains one explicitly shared stream. Load BEFORE vk-bridge.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.DekaDecks = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (win) {
  'use strict';
  var nativePlay = win && win.HTMLMediaElement.prototype.play;
  function clamp(n, a, b) { n = +n; return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a; }
  function weights(x) { x = clamp(x, -1, 1); return x <= -1 ? [1, 0] : x >= 1 ? [0, 1] : [Math.cos((x + 1) * Math.PI / 4), Math.sin((x + 1) * Math.PI / 4)]; }
  function create(opts) {
    var ctx, output, compressor, outputMeter, cross = 0, master = 0.8, vkSide = 'A', awake = null, destroyed = false;
    var state = {}, elements = {}, nodes = {}, listeners = [];
    ['A', 'B'].forEach(function (side) { state[side] = { side: side, track: null, list: [], index: -1, paused: true, time: 0, duration: 0,
      gain: 1, eq: [0, 0, 0], filter: 0, rate: 1, muted: false, loop: null, hotCues: [null,null,null], generation: 0, cue: 0, pending: false }; });
    function tell(message) { if (opts.message) opts.message(message); }
    function changed() {
      if (destroyed) return;
      if (opts.change) opts.change(state);
      var on = Object.values(state).some(function (s) { return !s.paused; });
      if (on !== awake) {
        try { if (win.DekaAndroid) win.DekaAndroid.keepAwake(on); awake = on; } catch (_) {}
      }
    }
    function vk(c) {
      if (win.DekaNativeView && win.DekaNativeView.isNative()) return false;
      return opts.vk(c);
    }
    function ramp(param, value) {
      var t = ctx.currentTime;
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
      else { var v = param.value; param.cancelScheduledValues(t); param.setValueAtTime(v, t); }
      // Finite ramp reaches exact silence; no asymptotic leakage at fader zero.
      param.linearRampToValueAtTime(value, t + 0.015);
    }
    function meter(node) {
      if (!node) return 0;
      var data = new Float32Array(node.fftSize); node.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce(function (a, v) { return a + v*v; }, 0) / data.length);
    }
    function persist() {
      try { win.localStorage.setItem('deka2:mixer:v1', JSON.stringify({cross: cross, master: master,
        A: {gain:state.A.gain,eq:state.A.eq}, B:{gain:state.B.gain,eq:state.B.eq}})); } catch (_) {}
    }
    try {
      var saved = JSON.parse(win.localStorage.getItem('deka2:mixer:v1'));
      if (saved) { cross=clamp(saved.cross,-1,1); master=clamp(saved.master,0,1);
        ['A','B'].forEach(function(side){var v=saved[side]; if(v){state[side].gain=clamp(v.gain,0,1);
          if(Array.isArray(v.eq)&&v.eq.length===3)state[side].eq=v.eq.map(function(n){return clamp(n,-12,12);});}}); }
    } catch (_) {}

    function setup() {
      if (ctx) return;
      ctx = new (win.AudioContext || win.webkitAudioContext)();
      output = ctx.createGain(); output.gain.value = master;
      compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = -3; compressor.ratio.value = 12;
      outputMeter=ctx.createAnalyser(); outputMeter.fftSize=1024; compressor.connect(output); output.connect(outputMeter); outputMeter.connect(ctx.destination);
    }
    function audio(side) {
      if (elements[side]) return elements[side];
      setup();
      var el = new win.Audio(); el.preload = 'metadata';
      var source = ctx.createMediaElementSource(el), filters = [120, 1000, 8000].map(function (f, i) {
        var n = ctx.createBiquadFilter(); n.type = ['lowshelf', 'peaking', 'highshelf'][i]; n.frequency.value = f; n.Q.value = 0.8; return n;
      });
      var gain = ctx.createGain(), p = source, filter=ctx.createBiquadFilter(), an=ctx.createAnalyser();
      filter.type='allpass'; filter.Q.value=0.7; an.fftSize=1024;
      gain.gain.value=state[side].gain*weights(cross)[side==='A'?0:1]*(state[side].muted?0:1);
      filters.forEach(function (n) { p.connect(n); p = n; }); p.connect(filter); filter.connect(gain); gain.connect(an); an.connect(compressor);
      nodes[side] = { gain: gain, filters: filters, filter:filter, meter:an }; elements[side] = el;
      ['playing', 'pause', 'loadedmetadata', 'timeupdate', 'seeked'].forEach(function (event) {
        el.addEventListener(event, function () {
          var s = state[side]; if (!s.track || s.track.kind !== 'file') return;
          s.time = el.currentTime || 0; s.duration = Number.isFinite(el.duration) ? el.duration : 0; s.paused = el.paused; s.pending = event === 'loadedmetadata' ? s.pending : false; changed();
        });
      });
      el.addEventListener('ended', function () { if(state[side].loop){seek(side,state[side].loop.start);play(side);}else step(side, 1, true); });
      el.addEventListener('error', function () { state[side].paused = true; state[side].pending = false; tell('Файл не воспроизводится: ' + (state[side].track || {}).title); changed(); });
      apply(); return el;
    }
    function apply() {
      var w = weights(cross);
      ['A', 'B'].forEach(function (side, i) {
        var s = state[side], n = nodes[side];
        if (n) {
          ramp(n.gain.gain, s.muted ? 0 : s.gain * w[i]);
          n.filters.forEach(function (f,j){ramp(f.gain,s.eq[j]);});
          n.filter.type=Math.abs(s.filter)<0.02?'allpass':s.filter<0?'lowpass':'highpass';
          ramp(n.filter.frequency,s.filter<0?18000*Math.pow(160/18000,-s.filter):30*Math.pow(8000/30,s.filter));
          elements[side].playbackRate=s.rate; elements[side].preservesPitch=true;
        }
      });
      if (output) ramp(output.gain, master);
      var s = state[vkSide];
      if (s.track && s.track.kind !== 'file') {
        vk({ type: 'volume', value: clamp(master * (s.muted ? 0 : s.gain) * w[vkSide === 'A' ? 0 : 1], 0, 1) });
        vk({ type: 'fx', on: true, pre: 0, gains: [s.eq[0],s.eq[0],s.eq[0],s.eq[1],s.eq[1],s.eq[1],s.eq[1],s.eq[2],s.eq[2],s.eq[2]], filter: s.filter, bal: 0 });
        vk({type:'rate',value:s.rate});
      }
    }
    function pause(side) {
      var s = state[side]; if(!s)return; s.generation++; s.pending = false;
      if (s.track && s.track.kind === 'file') { if (elements[side]) elements[side].pause(); }
      else if (side === vkSide) vk({ type: 'pause' });
      s.paused = true; changed();
    }
    function load(side, list, index) {
      var s = state[side]; if (!s) return;
      list = (Array.isArray(list) ? list : []).filter(function (t) { return t && t.key; });
      if (!list.length) { tell('Список пуст'); return; }
      pause(side); s.list = list.slice(); s.index = Math.floor(clamp(index, 0, list.length - 1));
      s.track = s.list[s.index]; s.accountId = win.DekaLibrary ? win.DekaLibrary.userId() : ''; s.time = 0; s.duration = s.track.duration || 0; s.cue = 0; s.loop=null; s.hotCues=[null,null,null];
      if (s.track.kind === 'file') { var el = audio(side); el.src = s.track.url; el.load(); apply(); }
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
          if(generation===s.generation){s.paused=el.paused;s.pending=false;}
        } else {
          if (vkSide !== side) { var other = state[vkSide]; if (other.track && other.track.kind !== 'file') { other.paused = true; other.pending = false; other.generation++; tell('VK: переключён один общий поток на деку ' + side); } vkSide = side; }
          apply();
          var ok = s.track.key === 'live-vk' ? await vk({ type: 'play' }) : await vk({ type: 'playKey', key: s.track.key, side: side, accountId: s.accountId });
          if (generation !== s.generation) return;
          apply();
          if (ok === true) { s.pending = false; s.paused = false; }
          if (ok === false) { s.pending = false; s.paused = true; tell('VK не подтвердил запуск. Откройте VK и попробуйте включить этот трек там; чужая песня вместо него не запускается.'); }
        }
      } catch (_) { if (generation === s.generation) { s.pending = false; s.paused = true; tell('Не удалось запустить деку ' + side); } }
      changed();
    }
    function toggle(side) { if (!state[side]) return; if (state[side].paused && !state[side].pending) return play(side); pause(side); }
    function seek(side, time) {
      var s = state[side]; if(!s || !s.track)return; time = clamp(time, 0, s.duration || 0);
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
      if (win.DekaNativeView && win.DekaNativeView.isNative()) return;
      if (win.DekaSession && win.DekaSession.read().authenticated !== true) return;
      var s = state[vkSide], wasPaused=s.paused, wasPending=s.pending;
      // The library adapter confirms requested playback. Stale metadata must not light the deck.
      if (s.pending && s.track && s.track.key !== 'live-vk') return;
      if (!s.track || s.track.kind === 'file') {
        // Playback started in the visible VK page, not a deck. Adopt it explicitly.
        if (!data.paused && data.title && !s.track) { s.track = { key: 'live-vk', title: data.title, artist: data.artist, kind: 'vk' }; apply(); } else return;
      }
      if(data.title && data.title!==s.track.title && s.track.key!=='live-vk'){s.paused=true;changed();return;}
      s.time = +data.currentTime || 0; s.duration = +data.duration || 0;
      s.paused = !!data.paused;
      if (!data.paused && (data.title === s.track.title || s.track.key==='live-vk')) s.pending = false;
      if(s.track.key==='live-vk'&&data.title){s.track.title=data.title;s.track.artist=data.artist||'';}
      if((wasPaused&&!s.paused)||(wasPending&&!s.pending))apply();
      changed();
    }
    function endedVK() {
      if (win.DekaNativeView && win.DekaNativeView.isNative()) return;
      var side = vkSide, s = state[side], index = s.index + 1, generation = s.generation;
      setTimeout(function () { if (!destroyed && generation === s.generation && s.list[index]) { load(side, s.list, index); play(side); } }, 150);
    }
    // Loop transport is based on media time, not UI timers. No fake beat sync.
    var transportTimer=win.setInterval(function(){
      if(destroyed)return;
      ['A','B'].forEach(function(side){var s=state[side],el=elements[side];
        if(!s.paused&&s.loop&&s.track&&s.track.kind==='file'&&el&&el.currentTime>=s.loop.end){el.currentTime=s.loop.start;}
      });
    },40);
    function adjusted(){apply();persist();changed();}
    return { clearVK: function () { ['A','B'].forEach(function (side) { var s = state[side]; if (s.track && s.track.kind !== 'file') { pause(side); s.track=null; s.list=[]; s.index=-1; s.time=0; s.duration=0; s.accountId=''; } }); changed(); },
      state: state, load: load, play: play, pause: pause, toggle: toggle, seek: seek, step: step,
      noteVK: noteVK, endedVK: endedVK,
      cue: function (side) { var s = state[side]; if (s.paused) s.cue = s.time; else { pause(side); seek(side, s.cue); } changed(); },
      setCross: function (x) { cross = clamp(x, -1, 1); adjusted(); },
      setMaster: function (x) { master = clamp(x, 0, 1); adjusted(); },
      setGain: function (side, x) { if(state[side])state[side].gain = clamp(x, 0, 1); adjusted(); },
      setEQ: function (side, band, value) { if (state[side] && Number.isInteger(band) && band >= 0 && band < 3) state[side].eq[band] = clamp(value, -12, 12); adjusted(); },
      setFilter: function(side,value){if(state[side])state[side].filter=clamp(value,-1,1);adjusted();},
      setRate: function(side,value){if(state[side])state[side].rate=clamp(value,0.84,1.16);apply();changed();},
      mute: function(side){if(state[side])state[side].muted=!state[side].muted;adjusted();},
      hotCue: function(side,index,save){var s=state[side];if(!s||!s.track||index<0||index>2)return;
        if(save||s.hotCues[index]===null)s.hotCues[index]=s.time;else seek(side,s.hotCues[index]);changed();},
      loop: function(side,seconds){var s=state[side];if(!s||!s.track)return;
        if(s.track.kind!=='file'){tell('Точные петли доступны для своих файлов; VK управляет своим потоком.');return;}
        if(!seconds||s.loop){s.loop=null;}else{var end=Math.min(s.duration,s.time+clamp(seconds,1,16));if(end>s.time+0.2)s.loop={start:s.time,end:end,seconds:seconds};}changed();},
      resetMixer: function(){cross=0;master=0.8;['A','B'].forEach(function(side){var s=state[side];s.gain=1;s.eq=[0,0,0];s.filter=0;s.muted=false;s.rate=1;});adjusted();},
      levels: function(){return {A:meter(nodes.A&&nodes.A.meter),B:meter(nodes.B&&nodes.B.meter),master:meter(outputMeter)};},
      destroy: function () { win.clearInterval(transportTimer); pause('A'); pause('B'); destroyed = true; Object.values(elements).forEach(function (a) { a.removeAttribute('src'); a.load(); }); if (ctx) ctx.close(); },
      diagnostics: function () { return { cross: cross, weights: weights(cross), master: master, vkSide: vkSide, localPlayers: Object.keys(elements).length, effective:{A:state.A.gain*weights(cross)[0]*(state.A.muted?0:1),B:state.B.gain*weights(cross)[1]*(state.B.muted?0:1)}, audioGains:{A:nodes.A?nodes.A.gain.gain.value:null,B:nodes.B?nodes.B.gain.gain.value:null}, outputGain:output?output.gain.value:master }; }
    };
  }
  return { create: create, weights: weights, clamp: clamp };
});
