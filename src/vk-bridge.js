/* Deka 2 native VK transport. Never captures VK media into a second AudioContext.
 * No private API, credential access, audio downloading or first-song fallback. */
(function () {
  'use strict';
  if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname) || window.__deka) return;
  var media = null, generation = 0, lastState = '', watched = new WeakSet(), handlers = {};
  var nativePlay = HTMLMediaElement.prototype.play;
  function isVideoPage() { return /vkvideo\.ru$/.test(location.hostname) || /^\/(video|clip)/.test(location.pathname); }
  function emit(name, data) { window.dispatchEvent(new CustomEvent('deka2:' + name, { detail: data })); }
  function session() { return window.DekaSession ? window.DekaSession.read().authenticated : null; }
  function state() {
    var metadata = navigator.mediaSession && navigator.mediaSession.metadata;
    return { title: metadata && metadata.title || '', artist: metadata && metadata.artist || '',
      album: metadata && metadata.album || '', video: isVideoPage(),
      currentTime: media && Number.isFinite(media.currentTime) ? media.currentTime : 0,
      duration: media && Number.isFinite(media.duration) ? media.duration : 0,
      paused: !media || media.paused, volume: media ? media.volume : 1, hasMedia: !!media,
      mediaGeneration: generation, playing: !!(media && media.__dekaPlaying),
      readyState: media ? media.readyState : 0, mediaError: media && media.error ? media.error.code : 0,
      loggedIn: session() };
  }
  function tick() { var s = state(), json = JSON.stringify(s); if (json !== lastState) { lastState = json; emit('vk:state', s); } }
  function adopt(el) {
    if (!el || el.__dekaLocal) return;
    if (media !== el) generation++;
    media = el;
    if (watched.has(el)) return;
    watched.add(el);
    el.addEventListener('playing', function () { el.__dekaPlaying = true; if (el === media) { generation++; tick(); } });
    ['pause','waiting','ended','emptied'].forEach(function (name) {
      el.addEventListener(name, function () { el.__dekaPlaying = false; if (el === media) tick(); });
    });
    el.addEventListener('ended', function () { if (el === media) emit('vk:ended', {}); });
    el.addEventListener('error', function () { if (el === media) { emit('vk:playerror', { reason: 'media-error', code: el.error ? el.error.code : 0 }); tick(); } });
  }
  HTMLMediaElement.prototype.play = function () {
    if (this.tagName === 'AUDIO' || (this.tagName === 'VIDEO' && isVideoPage())) adopt(this);
    return nativePlay.apply(this, arguments);
  };
  function findMedia() {
    if (media) return media;
    var el = document.querySelector(isVideoPage() ? 'video' : 'audio');
    if (el) adopt(el); return media;
  }
  function action(name) { if (!handlers[name]) return false; try { handlers[name]({action:name}); return true; } catch (_) { return false; } }
  function play() {
    var el = findMedia();
    if (!el) return action('play');
    el.muted = false;
    var promise = el.play();
    if (promise && promise.catch) promise.catch(function (e) { emit('vk:playerror', {reason:e.name || 'play-rejected'}); });
    return true; // UI waits for playing + progressing media; this is not a playback confirmation.
  }
  try {
    var ms = navigator.mediaSession;
    if (ms && ms.setActionHandler) {
      var original = ms.setActionHandler.bind(ms);
      ms.setActionHandler = function (name, fn) { handlers[name] = fn; return original(name, fn); };
    }
  } catch (_) {}
  window.__deka = {
    cmd: function (c) {
      c = c || {};
      switch (c.type) {
        case 'play': return play();
        case 'toggle': if (media && !media.paused) media.pause(); else return play(); break;
        case 'pause': if (media) media.pause(); break;
        case 'stop': if (media) { media.pause(); media.currentTime = 0; } break;
        case 'seek': if (media && Number.isFinite(+c.time)) media.currentTime = Math.max(0, +c.time); break;
        case 'skip': if (media && Number.isFinite(+c.by)) media.currentTime = Math.max(0, media.currentTime + +c.by); break;
        case 'volume': if (media && Number.isFinite(+c.value)) media.volume = Math.max(0, Math.min(1, +c.value)); break;
        case 'rate': if (media && Number.isFinite(+c.value)) { media.playbackRate = Math.max(.84, Math.min(1.16, +c.value)); media.preservesPitch = true; } break;
        case 'next': return action('nexttrack');
        case 'prev': if (media && media.currentTime > 3) media.currentTime = 0; else return action('previoustrack'); break;
        case 'fx': return false; // Explicit native bypass. File-deck EQ still lives in deck-engine.js.
        case 'diag': emit('vk:diag', {accountId:window.DekaSession ? window.DekaSession.userId() : '', path:location.pathname, hasMedia:!!media, state:state()}); break;
        default: return false;
      }
      tick(); return true;
    },
    playback: state,
    debug: function () { var items = window.DekaLibrary ? window.DekaLibrary.adapter.read() : []; return {np:state(), rows:items.length, sample:items.slice(0,3)}; }
  };
  // Old navigation intents must not start a random song after an update.
  try { ['dekaAutoplay','dekaFind','dekaCollect'].forEach(function (key) { sessionStorage.removeItem(key); }); } catch (_) {}
  var timer = setInterval(tick, 250);
  window.addEventListener('pagehide', function () { clearInterval(timer); }, {once:true});
})();
