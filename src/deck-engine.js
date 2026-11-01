/* Two real file players; VK remains one explicitly shared stream. Load BEFORE vk-bridge.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.DekaDecks = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (win) {
  'use strict';
  var nativePlay = win && win.HTMLMediaElement.prototype.play;
  function clamp(n, a, b) { n = +n; return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a; }
  function weights(x) { x = clamp(x, -1, 1); return [Math.cos((x + 1) * Math.PI / 4), Math.sin((x + 1) * Math.PI / 4)]; }
  function nextIndex(list, index, direction, shuffle, random) {
    if (!list.length) return -1;
    if (index < 0 || index >= list.length) return shuffle ? Math.floor(clamp((random || Math.random)(),0,.999999)*list.length) : direction > 0 ? 0 : list.length-1;
    if (shuffle && list.length > 1) {
      var n = Math.floor(clamp((random || Math.random)(), 0, 0.999999) * (list.length - 1));
      return n >= index ? n + 1 : n;
    }
    return (index + direction + list.length) % list.length;
  }
  function create(opts) {
    opts = opts || {};
    var ctx, output, compressor, safety, masterMeter, cross = 0, master = 0.8, vkSide = 'A', awake = null, destroyed = false;
    var state = {}, elements = {}, nodes = {}, vinyl = {}, preparing = {}, aborts = {};
    var mix = null, starting = null, autoSerial = 0, autoCross = null, manualOverlap=false, manualUntil=0, failed = new Set(),phaseTimer=null,rateRamps={},brakeSerial=0;
    function resetMixTone(preserve){ ['A','B'].forEach(function(side){var s=state[side];if(s){if(preserve){if(s.autoRate!==null)s.rate=elements[side]?elements[side].playbackRate:s.autoRate;s.eq=s.eq.map(function(v,j){return clamp(v+s.autoEQ[j],-12,12);});}s.autoEQ=[0,0,0];s.autoRate=null;rate(side);}}); apply(); }
    function cancelAuto() {
      autoSerial++; mix = null;if(phaseTimer!==null){win.clearTimeout(phaseTimer);phaseTimer=null;}rateRamps={};resetMixTone(!!opts.beatMix);
      var pending = starting; starting = null;
      if(pending&&pending.cancelWait)pending.cancelWait();
      if (pending && !pending.alreadyPlaying) {
        var s=state[pending.to]; s.generation++; s.pending=false;
        if (elements[pending.to]) elements[pending.to].pause();
        else if (vkSide===pending.to) vk({type:'pause'});
        s.paused=true; if(s.track)s.status='paused';
      }
    }
    function crossTo(value) { cross = clamp(value, -1, 1); apply(); }
    ['A', 'B'].forEach(function (side) { state[side] = { side: side, track: null, list: [], index: -1, paused: true, time: 0, duration: 0,
      gain: 1, eq: [0, 0, 0], autoEQ:[0,0,0], autoRate:null, autoGain:1, effects:Object.fromEntries(['Flanger','Echo','Reverb','Filter','Phaser','Roll'].map(function(n){return [n,{on:false,amount:.35}];})),fxStatus:'idle',analysis:null, analysisStatus:'idle', generation: 0, endedGeneration:-1,completed:false,cue: 0,cueActive:false,cueStage:0,syncBPM:null,manualStopped:false,braking:null,brakeStatus:'idle', pending: false, status: 'empty', error: '', rate: 1, nudge: 0, bpm: null, taps: [], keyLock: opts.keyLock === undefined ? !!opts.djMode : !!opts.keyLock, held: false, scratchStatus: 'idle' }; });
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
      state[side].braking=null;state[side].brakeStatus='idle';
      if (n) { if(n.fx)n.fx.dispose();if(n.brake)n.brake.dispose();n.source.disconnect(); n.filters.forEach(function (f) { f.disconnect(); }); n.gain.disconnect(); n.meter.disconnect(); }
    }
    function audio(side) {
      if (elements[side]) return elements[side];
      setup();
      var el = new win.Audio(); el.preload = 'auto'; el.preservesPitch = false; el.loop = !!opts.repeatTrack;
      var playbackEpoch=0,handledEnd=-1;
      el.__dekaStart=function(){playbackEpoch++;};
      var source = ctx.createMediaElementSource(el), filters = [120, 1000, 8000].map(function (f, i) {
        var n = ctx.createBiquadFilter(); n.type = ['lowshelf', 'peaking', 'highshelf'][i]; n.frequency.value = opts.smartMix?[180,1000,3500][i]:f; n.Q.value = 0.8; return n;
      });
      var gain = ctx.createGain(), meter = ctx.createAnalyser(), p = source;
      meter.fftSize = 2048;
      var fx=opts.effects&&win.DekaEffects?win.DekaEffects.create(ctx,gain):null;
      var brake=opts.brake&&win.DekaBrake?win.DekaBrake.create(ctx,filters[0],function(data){brakeMessage(side,data);}):null;
      source.connect(brake?brake.input:filters[0]);for(var j=1;j<filters.length;j++)filters[j-1].connect(filters[j]);filters[2].connect(fx?fx.input:gain);gain.connect(meter);meter.connect(output);
      nodes[side] = { source: source, gain: gain, filters: filters, meter: meter,fx:fx,brake:brake }; elements[side] = el;
      function current() { return !destroyed && elements[side] === el && state[side].track && state[side].track.kind === 'file'; }
      if(fx){state[side].fxStatus='loading';Object.keys(state[side].effects).forEach(function(name){var effect=state[side].effects[name];fx.set(name,effect.on,effect.amount);});fx.ready.then(function(){if(!current())return;state[side].fxStatus=fx.diagnostics().Roll.status;changed();});}
      if(brake){state[side].brakeStatus='loading';brake.ready.then(function(){if(current()){state[side].brakeStatus=brake.status;changed();}});}
      ['playing', 'pause', 'loadedmetadata', 'timeupdate', 'waiting', 'canplay', 'seeked'].forEach(function (event) {
        el.addEventListener(event, function () {
          if (!current()) return;
          var s = state[side];
          if (s.held||s.braking) return;
          s.time = el.currentTime || 0; s.duration = Number.isFinite(el.duration) ? el.duration : 0; s.paused = el.paused;
          if (event === 'waiting') s.status = 'loading';
          else if (event === 'playing') { s.status = 'playing'; s.pending = false; }
          else if (event === 'pause') { s.status = 'paused'; s.pending = false; }
          else if (event === 'loadedmetadata' || event === 'canplay' || event === 'seeked') s.status = el.paused ? 'ready' : 'playing';
          if(s.completed&&el.paused)s.status='ended';
          if(s.manualStopped&&el.paused)s.status='paused';
          if(event==='loadedmetadata'&&opts.analysis&&s.analysisStatus==='idle'){
            var track=s.track;s.analysisStatus='loading';
            opts.analysis.analyze(track,s.duration).then(function(data){if(!current()||s.track!==track)return;s.analysis=data;s.analysisStatus=data?'ready':'unavailable';rate(side);changed();});
          }
          apply();changed();
        });
      });
      el.addEventListener('ended', function () {
        if (!current() || !el.ended || handledEnd===playbackEpoch || state[side].completed||state[side].manualStopped||state[side].braking) return;
        handledEnd=playbackEpoch;
        var s = state[side]; s.completed=true;s.paused = true; s.pending = false; s.status = 'ended'; s.time = el.currentTime;apply(); changed();
        s.endedGeneration=s.generation;
        // The outgoing native ended event must not complete an in-flight fade twice.
        if(mix&&mix.from===side&&mix.track===s.track)return;
        finish(side);
      });
      el.addEventListener('error', function () {
        if (!current()) return;
        var s = state[side], recover = !s.paused || s.pending;
        s.paused = true; s.pending = false; s.status = 'error';
        s.error = 'Файл недоступен или формат не поддерживается';
        failed.add(s.track.key);
        tell(s.error + ': ' + s.track.title);apply(); changed();
        if (recover && opts.continuous && !Object.values(state).some(function (x) { return !x.paused || x.held; })) finish(side);
      });
      apply(); rate(side); return el;
    }
    function rate(side) {
      var s = state[side], el = elements[side];
      if (el) { el.preservesPitch = s.keyLock; var nextRate=clamp(s.braking?s.braking.baseRate:s.autoRate===null?s.rate+s.nudge:s.autoRate,opts.sweepMix?.25:.8,1.2);if(Math.abs(el.playbackRate-nextRate)>1e-7)el.playbackRate=nextRate;if(nodes[side].fx)nodes[side].fx.setBPM((s.syncBPM||s.bpm||(s.analysis&&s.analysis.bpm)||120)*nextRate); }
      else if(opts.externalTempo&&s.track&&s.track.kind!=='file'&&side===vkSide)vk({type:'rate',value:clamp(s.rate+s.nudge,.8,1.2),preservePitch:s.keyLock});
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
        if (n) { n.gain.gain.setTargetAtTime((opts.djMode ? 0.25 : 1) * s.gain * s.autoGain * w[i]*(n.fx&&s.paused&&!s.held?0:1), ctx.currentTime, 0.02); n.filters.forEach(function (f, j) { f.gain.setTargetAtTime(clamp(s.eq[j]+s.autoEQ[j],-24,12), ctx.currentTime, 0.04); }); }
      });
      if (output) output.gain.setTargetAtTime(master, ctx.currentTime, 0.02);
      var s = state[vkSide];
      if (s.track && s.track.kind !== 'file') {
        vk({ type: 'volume', value: clamp(master * s.gain * w[vkSide === 'A' ? 0 : 1], 0, 1) });
        vk({ type: 'fx', on: true, pre: 0, gains: [s.eq[0],s.eq[0],s.eq[0],s.eq[1],s.eq[1],s.eq[1],s.eq[1],s.eq[2],s.eq[2],s.eq[2]], filter: 0, bal: 0 });
      }
    }
    function pause(side, automatic) {
      abortBrake(side);
      if (!automatic) {cancelAuto();manualOverlap=false;}
      var s = state[side];
      if (s.held) { s.held = false; if (vinyl[side]) vinyl[side].release(); if (elements[side]) elements[side].currentTime = s.time; }
      s.generation++; s.pending = false;
      if (s.track && s.track.kind === 'file') { if (elements[side]) elements[side].pause(); }
      else if (side === vkSide) vk({ type: 'pause' });
      s.paused = true; if (s.track && s.status !== 'error') s.status = s.completed?'ended':'paused';apply(); changed();
    }
    function load(side, list, index, automatic) {
      if (!automatic) cancelAuto();
      var s = state[side]; if (!s) return;
      list = (Array.isArray(list) ? list : []).filter(function (t) { return t && t.key; });
      if (!list.length) { tell('Список пуст'); return; }
      pause(side, true); release(side); s.list = list.slice(); s.index = Math.floor(clamp(index, 0, list.length - 1));
      s.track = s.list[s.index]; s.time = 0; s.duration = s.track.duration || 0; s.cue = 0;s.cueActive=false;s.cueStage=0;s.syncBPM=null;s.manualStopped=false; s.rate = 1; s.nudge = 0; s.bpm = null; s.taps = []; s.error = ''; s.status = 'loading';
      s.autoLoaded = !!automatic;
      s.autoGain=1;s.autoEQ=[0,0,0];s.autoRate=null;s.analysis=null;s.analysisStatus='idle';s.rateTouched=false;s.actualRate=null;s.endedGeneration=-1;s.completed=false;
      s.autoBlocked = false;
      if (!automatic && !state[side === 'A' ? 'B' : 'A'].track) state[side === 'A' ? 'B' : 'A'].autoBlocked=false;
      if (!automatic) failed.delete(s.track.key);
      if (s.track.kind === 'file') { var el = audio(side); el.src = s.track.url; rate(side); el.load(); }
      changed();
    }
    async function play(side, automatic) {
      abortBrake(side);
      if(nodes[side]&&nodes[side].brake)nodes[side].brake.stop();
      var other=state[side==='A'?'B':'A'];
      if(!automatic&&other.track&&(!other.paused||other.pending)){
        manualOverlap=true;
        if(opts.smartMix&&autoCross===null&&Math.abs(cross)>.98)crossTo(0);
      }
      if (!automatic && autoCross !== null && !state[side === 'A' ? 'B' : 'A'].paused) { crossTo(autoCross); autoCross=null; }
      if (!automatic) cancelAuto();
      var s = state[side]; if (!s || !s.track) { tell('Сначала выберите трек в списке ' + side); return; }
      if(!automatic){s.manualStopped=false;s.autoBlocked=false;}
      if (!automatic) s.autoLoaded = false;
      if (s.held) return;
      if(s.completed&&s.track.kind==='file'&&elements[side]&&!automatic){elements[side].currentTime=0;s.time=0;}
      s.completed=false;
      var generation = ++s.generation; s.pending = true; s.error = ''; changed();
      try {
        if (s.track.kind === 'file') {
          var el = audio(side); await ctx.resume();
          if (generation !== s.generation) return;
          // Bypass VK's prototype hook, so local deck B is never adopted as VK audio.
          el.__dekaStart();await nativePlay.call(el);
          if (generation !== s.generation || elements[side] !== el) return;
        } else {
          if (vkSide !== side) { var other = state[vkSide]; if (other.track && other.track.kind !== 'file') { other.paused = true; other.pending = false; other.generation++; tell('VK: переключён один общий поток на деку ' + side); } vkSide = side; }
          apply();
          rate(side);
          var ok = s.track.key === 'live-vk' ? await vk({ type: 'play' }) : await vk({ type: 'playKey', key: s.track.key });
          if (ok === false) { s.pending = false; s.paused = true; tell('VK не нашёл выбранный трек. Другой трек вместо него не включён.'); return false; }
        }
      } catch (_) { if (generation === s.generation) { s.pending = false; s.paused = true; s.status = 'error'; s.error = 'Не удалось воспроизвести файл'; tell('Не удалось запустить деку ' + side); } }
      changed();
      return s.status !== 'error';
    }
    function toggle(side) { if (state[side].paused) return play(side); pause(side); }
    function seek(side, time) {
      abortBrake(side);
      cancelAuto();
      var s = state[side]; time = clamp(time, 0, s.duration || 0);
      if(time<s.duration-.005)s.completed=false;
      if (s.track && s.track.kind === 'file' && elements[side]) elements[side].currentTime = time;
      else if (side === vkSide) vk({ type: 'seek', time: time }); s.time = time; changed();
    }
    async function scratchBegin(side) {
      abortBrake(side);
      var s = state[side], el = elements[side];
      if (!opts.vinyl || !win.DekaVinyl || !el || !s.track || s.status === 'error' || s.held) return false;
      cancelAuto();
      var track = s.track, n = nodes[side], resume = !el.paused;
      s.generation++; s.pending = false; s.held = true; s.resumeAfterScratch = resume;
      s.time = el.currentTime; el.pause(); s.paused = true; s.status = 'held';apply(); changed();
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
      s.status = 'paused'; s.paused = true;apply(); changed();
      if (resume) play(side);
    }
    function step(side, direction, ended) {
      var s = state[side]; if (!s.list.length) return;
      var index = ended && opts.repeatTrack ? s.index : nextIndex(s.list, s.index, direction, opts.shuffle);
      load(side, s.list, index); return play(side);
    }
    function successor(side, avoid) {
      var s = state[side], list = s.list;
      var candidates = list.map(function (t, i) { return i; }).filter(function (i) {
        return !failed.has(list[i].key) && (list.length === 1 || list[i].key !== s.track.key) && list[i].key !== avoid;
      });
      if (!candidates.length) return s.track && !failed.has(s.track.key) && s.track.key !== avoid ? s.index : -1;
      if (opts.shuffle) return candidates[Math.floor(Math.random() * candidates.length)];
      for (var n = 1; n <= list.length; n++) { var i = (s.index + n) % list.length; if (candidates.includes(i)) return i; }
      return -1;
    }
    function prepareNext(from, atEnd) {
      var to = from === 'A' ? 'B' : 'A', a = state[from], b = state[to];
      if(b.manualStopped||b.braking)return to;
      if (b.autoBlocked && !atEnd) return to;
      if (!b.paused || b.held || b.pending) return to;
      if (b.track && !b.completed && b.status !== 'error' && b.status !== 'ended' && (b.status === 'loading' || b.time < b.duration - .05) &&
          (b.track.key !== a.track.key || b.autoLoaded)) return to;
      // A remote track has no metadata event until it is actually started.
      if (b.track && b.track.kind !== 'file' && b.status === 'loading' && b.track.key !== a.track.key) return to;
      var index = successor(from);
      if (index >= 0) load(to, a.list, index, true);
      return to;
    }
    async function finish(side) {
      if (destroyed) return;
      manualOverlap=false;
      var a = state[side];
      if (opts.repeatTrack && a.status !== 'error') { if (elements[side]) elements[side].currentTime = 0; else vk({type:'seek',time:0}); return play(side, true); }
      if (!opts.djMode) {
        if (!opts.continuous && a.index === a.list.length - 1) return;
        var i = successor(side); if (i >= 0) { load(side, a.list, i, true); play(side, true); }
        return;
      }
      if (!opts.continuous) return;
      var to = side === 'A' ? 'B' : 'A', b = state[to];
      if(b.manualStopped){var next=successor(side);if(next>=0){load(side,a.list,next,true);play(side,true);}return;}
      if (b.held) return;
      if (!b.paused) { mix = null; resetMixTone();crossTo(to === 'A' ? -1 : 1); changed(); return; }
      if (starting) return;
      prepareNext(side, true); b = state[to];
      if (!b.track || b.status === 'error' || failed.has(b.track.key)) { tell('Нет доступного следующего трека. Добавьте аудиофайлы.'); return; }
      var token = autoSerial, fromTrack=a.track, fromGeneration=a.generation, toTrack=b.track;
      starting = {from:side,to:to};
      var promise=play(to,true),toGeneration=b.generation;
      var ok = await promise;
      if (destroyed || token !== autoSerial || a.track!==fromTrack || a.generation!==fromGeneration || b.track!==toTrack || b.generation!==toGeneration) return;
      starting = null;
      if (ok) { crossTo(to === 'A' ? -1 : 1); changed(); }
      else { failed.add(b.track.key); finish(side); }
    }
    function abortBrake(side){
      var s=state[side],n=nodes[side],el=elements[side];if(!s||!s.braking)return;
      s.braking=null;if(n&&n.brake)n.brake.stop();
      if(el){el.currentTime=s.time;el.loop=!!opts.repeatTrack;}rate(side);
    }
    function brakeMessage(side,data){
      var s=state[side],b=s.braking,el=elements[side],n=nodes[side];
      if(!b||data.id!==b.id||!el||b.track!==s.track)return;
      s.time=clamp(b.origin+data.seconds*b.baseRate,0,s.duration);b.speed=data.speed;b.elapsed=data.elapsed;b.audioStart=data.audioTime-data.elapsed;
      if(data.type==='ended'){
        s.lastBrake={id:data.id,duration:data.duration,elapsed:data.elapsed,time:s.time,audioStart:b.audioStart,audioEnd:data.audioTime,completed:true};
        el.pause();el.currentTime=s.time;el.loop=!!opts.repeatTrack;s.braking=null;s.paused=true;s.pending=false;s.status='paused';s.completed=false;rate(side);apply();
      }
      changed();
    }
    function brake(side,seconds){
      var s=state[side],el=elements[side],n=nodes[side];
      if(!s||!el||!s.track||s.track.kind!=='file'||s.held||(!s.braking&&el.paused)||![.5,1,2].includes(+seconds)||!n.brake||n.brake.status!=='ready')return false;
      cancelAuto();autoCross=null;var previous=s.braking;
      var b={id:++brakeSerial,track:s.track,origin:previous?previous.origin:el.currentTime,baseRate:previous?previous.baseRate:el.playbackRate,speed:previous?previous.speed:1,elapsed:0,duration:+seconds};
      s.braking=b;s.manualStopped=true;s.autoBlocked=true;s.completed=false;s.generation++;s.pending=false;el.loop=false;
      n.brake.start(b.id,b.duration);changed();return true;
    }
    function sourceMeta(side){
      var s=state[side],a=s.analysis||{},bpm=s.syncBPM||s.bpm||a.bpm;
      return Object.assign({rms:.2,bands:[.01,.01,.01]},a,{bpm:bpm,confidence:s.bpm?1:a.confidence||0,phaseConfidence:a.bpm?a.confidence:0});
    }
    function rampRate(side,value,manual,start){
      var el=elements[side];if(!el)return;
      rateRamps[side]={from:el.playbackRate,to:value,start:start===undefined?ctx.currentTime:start,duration:.35,manual:!!manual};
    }
    function tickRates(){
      if(!ctx)return;
      Object.keys(rateRamps).forEach(function(side){
        var r=rateRamps[side],s=state[side],p=clamp((ctx.currentTime-r.start)/r.duration,0,1);
        s.autoRate=r.from+(r.to-r.from)*p;rate(side);
        if(p===1){if(r.manual){s.rate=r.to-s.nudge;s.autoRate=null;}delete rateRamps[side];rate(side);}
      });
    }
    function manualRate(side,value){
      var s=state[side];value=clamp(value,.92,1.08);s.rateTouched=true;
      if(s.braking){s.rate=value;changed();return;}
      if(opts.beatMix&&starting){cancelAuto();manualUntil=win.performance.now()+400;}
      if(opts.beatMix&&mix&&mix.beat){
        var other=side==='A'?'B':'A',meta=sourceMeta(side),om=sourceMeta(other),goal=meta.bpm?meta.bpm*(value+s.nudge):null,wanted=goal&&om.bpm?goal/om.bpm:null;
        var start=ctx.currentTime;s.rate=value;rampRate(side,value+s.nudge,true,start);
        if(wanted>=.92&&wanted<=1.08){rampRate(other,wanted,false,start);mix.plan.matched=true;mix.plan.targetBPM=goal;mix.plan.reason='matched';}
        else {mix.plan.matched=false;mix.plan.reason='manual';}
      }else {if(mix)mix.rateManual[side]=true;s.autoRate=null;s.rate=value;rate(side);}
      changed();
    }
    function cycleCue(side){
      var s=state[side];if(!s.track)return;
      if(!opts.cueCycle){if(s.paused){s.cue=s.time;s.cueActive=true;}else{pause(side);seek(side,s.cue);}changed();return;}
      if(!s.cueActive){s.cue=clamp(s.braking?s.time:elements[side]?elements[side].currentTime:s.time,0,Math.max(0,s.duration-.01));s.cueActive=true;s.cueStage=1;}
      else if(s.cueStage===1){var position=s.cue;pause(side);seek(side,position);s.cueStage=2;}
      else{s.cueActive=false;s.cue=0;s.cueStage=0;}
      changed();
    }
    function autoBeatTick(){
      if(starting)return;
      if(mix){
        var a=state[mix.from],b=state[mix.to];
        if(b.paused||a.track!==mix.track){cancelAuto();return;}
        var progress=clamp((ctx.currentTime-mix.start)/mix.duration,0,1),curve=win.DekaMixEnvelope.beat(progress,mix.beat.outEQ,mix.beat.inEQ);
        [mix.from,mix.to].forEach(function(side){var eq=side===mix.from?curve.outEQ:curve.inEQ;state[side].autoEQ=eq.map(function(v,j){return mix.eqManual[side][j]?0:v-state[side].eq[j];});});
        a.lastTransition.progress=progress;
        crossTo(mix.startCross+((mix.to==='A'?-1:1)-mix.startCross)*progress);
        if(progress>=1){
          var old=mix.from,done=mix, incoming=state[done.to];
          a.lastTransition=Object.assign({},a.lastTransition,{completed:true,elapsed:ctx.currentTime-done.start});
          incoming.rate=elements[done.to].playbackRate-incoming.nudge;
          incoming.eq=incoming.eq.map(function(v,j){return done.eqManual[done.to][j]?v:0;});
          a.completed=true;mix=null;pause(old,true);a.status='ended';manualOverlap=false;resetMixTone();
        }
        changed();return;
      }
      var active=['A','B'].filter(function(side){var s=state[side];return !s.paused&&!s.pending&&s.track&&!s.braking&&!s.manualStopped;});
      if(!active.length||!opts.autoMix||win.performance.now()<manualUntil)return;
      active.sort(function(x,y){return (state[x].duration-state[x].time)/elements[x]?.playbackRate-(state[y].duration-state[y].time)/elements[y]?.playbackRate;});
      var from=active[0],a=state[from],to=active.length===2?active[1]:prepareNext(from),b=state[to],el=elements[from],target=elements[to];
      if(a.track.kind!=='file'||!el||!b.track||b.track.kind!=='file'||b.braking||b.manualStopped||b.held||b.pending||!target||target.readyState<2||b.status==='error'||(active.length===1&&manualOverlap))return;
      var aa=sourceMeta(from),bb=sourceMeta(to),plan=opts.analysis?opts.analysis.plan(aa,bb,el.playbackRate):{matched:false,reason:'no-bpm',targetBPM:null,gain:1},incomingRate=plan.matched?plan.rate:target.playbackRate;
      var cue=active.length===2?target.currentTime:b.cueActive?b.cue:0;
      var requested=opts.fadeSeconds||17,seconds=Math.min(requested,el.duration/el.playbackRate-.1,(target.duration-cue)/incomingRate-.1);
      var remaining=(el.duration-el.currentTime)/el.playbackRate,lead=aa.bpm?60/aa.bpm/el.playbackRate+.35:.35;
      if(!(seconds>.05&&remaining>0)||remaining>seconds+lead)return;
      if(active.length===1){if(autoCross===null)autoCross=cross;crossTo(from==='A'?-1:1);}
      var delay=plan.matched&&active.length===1?opts.analysis.launchDelay(el.currentTime,aa,cue,Object.assign({},bb,{bpm:plan.sourceBPM}),el.playbackRate,incomingRate):null;
      var token=autoSerial,track=a.track,toTrack=b.track,fromGeneration=a.generation,pending={from:from,to:to,alreadyPlaying:active.length===2};starting=pending;
      var begin=async function(){
        phaseTimer=null;
        if(starting!==pending||token!==autoSerial||a.track!==track||b.track!==toTrack||a.generation!==fromGeneration||a.paused)return;
        if(plan.matched)b.syncBPM=plan.sourceBPM;
        if(active.length===2&&Math.abs(target.playbackRate-incomingRate)>.00001){
          rampRate(to,incomingRate,false);
          await new Promise(function(resolve){pending.cancelWait=resolve;phaseTimer=win.setTimeout(resolve,380);});phaseTimer=null;pending.cancelWait=null;
          if(starting!==pending||token!==autoSerial)return;
        }else {b.autoRate=incomingRate;rate(to);}
        var inEQ=active.length===2?b.eq.map(function(v,j){return v+b.autoEQ[j];}):[-6,-3,-3];
        if(active.length===1){target.currentTime=cue;b.time=cue;b.autoEQ=inEQ.map(function(v,j){return v-b.eq[j];});b.autoGain=clamp(plan.gain*a.autoGain,.35,1.5);apply();}
        var promise=active.length===2?Promise.resolve(true):play(to,true),generation=b.generation,ok=await promise;
        if(destroyed||starting!==pending||token!==autoSerial||a.track!==track||b.track!==toTrack||a.generation!==fromGeneration||b.generation!==generation)return;
        starting=null;
        if(!ok){failed.add(b.track.key);resetMixTone();return;}
        if(a.paused||el.ended){crossTo(to==='A'?-1:1);return;}
        var duration=Math.max(.05,Math.min(seconds,(el.duration-el.currentTime)/el.playbackRate-.08,(target.duration-target.currentTime)/target.playbackRate-.08));
        a.lastTransition={to:to,mode:'beat',duration:duration,requested:requested,matched:plan.matched,reason:plan.reason,targetBPM:plan.targetBPM,phase:delay===null?'unavailable':'launch',cue:active.length===1?cue:null,progress:0,completed:false};
        mix={from:from,to:to,track:track,start:ctx.currentTime,startCross:cross,plan:plan,beat:{outEQ:a.eq.map(function(v,j){return v+a.autoEQ[j];}),inEQ:inEQ},rateManual:{A:false,B:false},eqManual:{A:[false,false,false],B:[false,false,false]},duration:duration};changed();
      };
      if(delay!==null&&delay>.002)phaseTimer=win.setTimeout(begin,delay*1000);else begin();
    }
    // Only prepare the idle deck. Two manually playing decks are never replaced.
    // The transition starts after the new media has really entered playback.
    function autoTick() {
      tickRates();
      if (destroyed || !opts.continuous || !opts.djMode || opts.repeatTrack ||
          state.A.held || state.B.held) return;
      if(opts.beatMix){autoBeatTick();return;}
      if(starting)return;
      if (mix) {
        var a = state[mix.from], b = state[mix.to];
        if (b.paused || a.track !== mix.track) { var recover=mix.from;mix = null;resetMixTone();if(!state[recover].paused)crossTo(recover==='A'?-1:1);return; }
        var progress = clamp((ctx.currentTime - mix.start) / mix.duration, 0, 1);
        if(mix.sweep){
          var curve=win.DekaMixEnvelope.at(progress,mix.sweep.outRate,mix.sweep.outEQ,mix.sweep.inRate,mix.sweep.inEQ);
          if(!mix.rateManual[mix.from])a.autoRate=curve.outRate;
          if(!mix.rateManual[mix.to])b.autoRate=curve.inRate;
          ['A','B'].forEach(function(side){var values=side===mix.from?curve.outEQ:curve.inEQ;state[side].autoEQ=values.map(function(v,j){return mix.eqManual[side][j]?0:v-state[side].eq[j];});rate(side);});
          a.lastTransition.progress=progress;a.lastTransition.outRate=curve.outRate;a.lastTransition.inRate=curve.inRate;
        }else if(mix.plan){
          a.autoEQ=[-12*progress,-2*progress,-progress];
          b.autoEQ=[(-12+mix.plan.eq[0])*(1-progress),mix.plan.eq[1]*(1-progress),mix.plan.eq[2]*(1-progress)];
        }
        crossTo(mix.startCross+((mix.to==='A'?-1:1)-mix.startCross)*progress);
        if (progress >= 1) { var old = mix.from;state[old].lastTransition=Object.assign({},state[old].lastTransition,{completed:true,elapsed:ctx.currentTime-mix.start});state[old].completed=true;mix = null; pause(old, true); state[old].status = 'ended';manualOverlap=false;resetMixTone(); }
        changed(); return;
      }
      var active = ['A','B'].filter(function (s) { return !state[s].paused && !state[s].pending && state[s].track; });
      if (!active.length||(!opts.smartMix&&active.length!==1)) return;
      if(opts.smartMix&&active.length===2)active.sort(function(x,y){return (state[x].duration-state[x].time)/(state[x].rate+state[x].nudge)-(state[y].duration-state[y].time)/(state[y].rate+state[y].nudge);});
      var from = active[0], a = state[from], to = active.length===2?active[1]:prepareNext(from), b = state[to];
      if (!opts.autoMix || a.track.kind !== 'file' || !b.track || b.track.kind !== 'file' || b.held||b.pending||win.performance.now()<manualUntil) return;
      if(active.length===1&&manualOverlap)return;
      var el = elements[from], target = elements[to];
      if (!el || !target || target.readyState < 2 || b.status === 'error') return;
      var remaining = (el.duration - el.currentTime) / el.playbackRate;
      var sweepMode=!!(opts.sweepMix&&win.DekaMixEnvelope);
      var requested=opts.fadeSeconds||6;
      var seconds=sweepMode?requested:Math.min(requested,el.duration/el.playbackRate/4,target.duration/target.playbackRate/4);
      if(sweepMode&&(el.duration/el.playbackRate<requested*1.05||target.duration<requested*1.05))seconds=Math.min(seconds,el.duration/el.playbackRate/4,target.duration/4);
      if(sweepMode)seconds=Math.min(seconds,(target.duration-target.currentTime)/.96-.08);
      if (!(remaining > 0 && seconds > 0)) return;
      if(active.length===1){if (autoCross === null) autoCross = cross;crossTo(from === 'A' ? -1 : 1);}
      if (remaining > (sweepMode?seconds*2/3+.08:seconds)) return;
      if(sweepMode)seconds=Math.min(seconds,remaining*1.5+.18);
      var plan=null;
      if(opts.smartMix&&opts.analysis){
        var aa=a.analysis,bb=b.analysis;
        if(a.bpm)aa=Object.assign({},aa||{rms:.2,bands:[.01,.01,.01]},{bpm:a.bpm,confidence:1});
        if(b.bpm)bb=Object.assign({},bb||{rms:.2,bands:[.01,.01,.01]},{bpm:b.bpm,confidence:1});
        plan=opts.analysis.plan(aa,bb,a.rate+a.nudge);
        if(active.length===1){
          if(!sweepMode&&!b.rateTouched){b.rate=plan.rate;rate(to);}
          b.autoGain=clamp(plan.gain*a.autoGain,.35,1.5);
          if(!sweepMode&&plan.matched&&aa&&bb&&bb.beatOffset>=0&&b.time<.15){
            var period=60/aa.bpm,phase=((el.currentTime-aa.beatOffset)%period+period)%period;
            target.currentTime=Math.max(0,bb.beatOffset+phase*(b.rate/a.rate));
          }
          if(!sweepMode)b.autoEQ=[-12+plan.eq[0],plan.eq[1],plan.eq[2]];apply();
        }
        a.lastTransition={to:to,rate:b.rate,matched:plan.matched,eq:plan.eq.slice(),gain:b.autoGain};
      }
      var sweep=null;
      if(sweepMode){
        sweep={outRate:el.playbackRate,outEQ:a.eq.map(function(v,j){return v+a.autoEQ[j];}),inRate:active.length===2?target.playbackRate:.92,inEQ:active.length===2?b.eq.map(function(v,j){return v+b.autoEQ[j];}):[-12,-12,-12]};
        if(active.length===1){b.rate=1;b.nudge=0;b.eq=[0,0,0];b.autoRate=.92;b.autoEQ=[-12,-12,-12];rate(to);apply();}
        a.lastTransition={to:to,mode:'sweep',duration:seconds,outStart:sweep.outRate,outEnd:sweep.outRate/3,inStart:sweep.inRate,inEnd:1,progress:0,completed:false};
      }
      function transition(duration){return {from:from,to:to,track:track||a.track,start:ctx.currentTime,startCross:initialCross,plan:plan,sweep:sweep,rateManual:{A:false,B:false},eqManual:{A:[false,false,false],B:[false,false,false]},duration:duration};}
      var initialCross=cross;
      if(active.length===2){mix=transition(Math.max(.05,sweepMode?seconds:Math.min(seconds,remaining)));changed();return;}
      var token = autoSerial, track = a.track, toTrack=b.track;
      starting = {from:from,to:to};
      var promise=play(to,true),toGeneration=b.generation;
      promise.then(function (ok) {
        if (destroyed || token !== autoSerial || a.track!==track || b.track!==toTrack || b.generation!==toGeneration) return;
        starting = null;
        if (!ok) { failed.add(b.track.key); return; }
        if (a.paused || el.ended) { crossTo(to === 'A' ? -1 : 1); changed(); return; }
        mix = transition(Math.max(.05,sweepMode?seconds:Math.min(seconds,(el.duration-el.currentTime)/el.playbackRate)));
      });
    }
    var autoTimer = win && win.setInterval(autoTick, 60);
    function noteVK(data) {
      var s = state[vkSide];
      if (!s.track || s.track.kind === 'file') {
        // Playback started in the visible VK page, not a deck. Adopt it explicitly.
        if (!data.paused && data.title && !s.track) s.track = { key: 'live-vk', title: data.title, artist: data.artist, kind: 'vk' }; else return;
      }
      s.time = +data.currentTime || 0; s.duration = +data.duration || 0;
      s.paused = !!data.paused;
      s.actualRate=+data.playbackRate||null;
      s.status = s.paused ? 'paused' : 'playing';
      if (!data.paused && data.title === s.track.title) s.pending = false;
      changed();
    }
    function endedVK() {
      var side = vkSide, s = state[side], generation = s.generation, track=s.track;
      if(!track||track.kind==='file')return;
      setTimeout(function () { if (!destroyed && generation === s.generation && s.track===track && s.endedGeneration!==generation) { s.endedGeneration=generation;s.paused=true; s.pending=false; s.status='ended'; finish(side); } }, 50);
    }
    return { state: state, setDJMode: function (on) { cancelAuto(); opts.djMode=!!on; if(!on)cross=-1; apply(); }, load: load, play: play, pause: pause, toggle: toggle, seek: seek, step: step,
      setShuffle: function (on) { opts.shuffle=!!on; invalidateNext(); changed(); },
      setRepeat: function (on) { cancelAuto(); opts.repeatTrack=!!on; ['A','B'].forEach(function(s){if(elements[s])elements[s].loop=!!on&&!state[s].braking;}); changed(); },
      setAutoMix: function (on) { cancelAuto(); opts.autoMix=!!on; changed(); },
      noteVK: noteVK, endedVK: endedVK,
      scratchBegin: scratchBegin, scratchMove: scratchMove, scratchEnd: scratchEnd,brake:brake,
      setKeyLock: function (side, on) { state[side].keyLock = !!on; rate(side); changed(); },
      clear: function (side) { pause(side); release(side); var s = state[side]; s.track = null; s.list = []; s.index = -1; s.time = s.duration = s.cue = 0;s.cueActive=false;s.cueStage=0;s.manualStopped=false;s.syncBPM=null; s.status = 'empty'; s.error = ''; s.autoBlocked=true; changed(); },
      cue:cycleCue,
      setRate:manualRate,
      nudge: function (side, value) { state[side].nudge = clamp(value, -0.04, 0.04); rate(side); changed(); },
      setBPM: function (side, value) { if(opts.beatMix&&starting)cancelAuto();var s = state[side];s.syncBPM=null; s.bpm = +value > 0 ? clamp(value, 30, 300) : null;if(mix&&mix.beat){mix.plan.matched=false;mix.plan.reason='manual-bpm';}rate(side); changed(); },
      tap: function (side) { var s = state[side], now = win.performance.now();
        if (s.taps.length && now - s.taps[s.taps.length - 1] > 2000) s.taps = [];
        s.taps.push(now); if (s.taps.length > 8) s.taps.shift();
        if (s.taps.length > 1) {
          var tapped = 60000 * (s.taps.length - 1) / (now - s.taps[0]);
          // TAP follows the beat currently heard; store original BPM so the display
          // does not apply the tempo twice when tapping a deck that is already pitched.
          if (opts.djMode && !s.paused) tapped /= s.actualRate || (s.autoRate===null?s.rate+s.nudge:s.autoRate);
          s.bpm = Math.round(clamp(tapped, 30, 300) * 10) / 10;
          s.syncBPM=null;if(opts.beatMix&&starting)cancelAuto();if(mix&&mix.beat){mix.plan.matched=false;mix.plan.reason='manual-bpm';}
        }
        rate(side);changed(); return s.bpm;
      },
      meters: function () { return { A: meter(nodes.A && nodes.A.meter), B: meter(nodes.B && nodes.B.meter), master: meter(masterMeter) }; },
      setCross: function (x, keepAuto) { cancelAuto();autoCross=null;if(keepAuto)manualUntil=win.performance.now()+1500;else if(opts.djMode)opts.autoMix=false;crossTo(x);changed(); },
      setMaster: function (x) { master = clamp(x, 0, 1); apply(); },
      setGain: function (side, x) { state[side].gain = clamp(x, 0, 1); apply(); },
      setEQ: function (side, band, value) { if (band >= 0 && band < 3) {if(mix)mix.eqManual[side][band]=true;state[side].autoEQ[band]=0;state[side].eq[band] = clamp(value, -12, 12);} apply(); },
      setEffect: function(side,name,on,amount){var s=state[side],n=nodes[side];if(!s.effects[name]||!s.track||s.track.kind!=='file'||!n||!n.fx)return false;s.effects[name]={on:!!on,amount:clamp(amount,0,1)};var ok=n.fx.set(name,on,amount);if(!ok)tell(name+': обработка недоступна в этом WebView');changed();return ok;},
      destroy: function () { win.clearInterval(autoTimer); pause('A'); pause('B'); destroyed = true; release('A'); release('B'); if (ctx && !opts.context) ctx.close(); },
      diagnostics: function () { return { cross: cross, weights: weights(cross), master: master, vkSide: vkSide, localPlayers: Object.keys(elements).length, djMode:!!opts.djMode, shuffle:!!opts.shuffle, repeatTrack:!!opts.repeatTrack, autoMix:!!opts.autoMix, mixing:!!mix,preparing:!!starting,phaseTimer:phaseTimer!==null,rateRamps:Object.keys(rateRamps).length,transition:mix?{from:mix.from,to:mix.to,duration:mix.duration,elapsed:ctx.currentTime-mix.start,mode:mix.beat?'beat':mix.sweep?'sweep':'balance',matched:!!(mix.plan&&mix.plan.matched),reason:mix.plan&&mix.plan.reason,targetBPM:mix.plan&&mix.plan.targetBPM}:null,effects:Object.fromEntries(['A','B'].map(function(side){return [side,nodes[side]&&nodes[side].fx?nodes[side].fx.diagnostics():null];})) }; }
    };
    function invalidateNext() { cancelAuto(); ['A','B'].forEach(function (side) { if (state[side].autoLoaded && state[side].paused) { pause(side,true); release(side); state[side].track=null; state[side].status='empty'; } }); }
  }
  return { create: create, weights: weights, clamp: clamp, nextIndex: nextIndex };
});
