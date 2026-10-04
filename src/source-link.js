/* VK source relay. Commands may arrive before DOMContentLoaded: keep sync pending.
 * Transfers only session identity, track metadata, playback state and safe diagnostics. */
(function () {
  'use strict';
  if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname) || window.DekaSource) return;
  var domReady = false, syncPending = false, syncBusy = false;
  function send(kind, data) {
    try { var p = window.__TAURI__.event.emitTo('main', 'deka2-source', {protocol:1,kind:kind,data:data}); if (p && p.catch) p.catch(function () {}); } catch (_) {}
  }
  function snapshot() {
    if (!domReady) return;
    if (window.DekaSession) send('session', DekaSession.read());
    if (window.DekaLibrary) { send('library', DekaLibrary.get()); send('diagnostics', DekaLibrary.diagnostics()); }
    if (window.__deka) send('state', window.__deka.playback());
  }
  async function drainSync() {
    if (!domReady || !window.DekaLibrary || syncBusy || !syncPending) return;
    syncPending = false; syncBusy = true;
    send('activity', {active:true});
    try { await DekaLibrary.collectMy(); }
    catch (_) { send('error', {reason:'source-read-error'}); }
    finally { syncBusy=false; snapshot(); send('activity', {active:DekaLibrary.isRunning()}); }
  }
  window.DekaSource = {receive: async function (cmd, id) {
    cmd=cmd||{}; var value=false;
    try {
      if (cmd.type==='ping') { snapshot(); value=domReady; }
      else if (cmd.type==='sync') {
        if (!syncBusy) syncPending=true;
        drainSync(); value=true;
      } else if (cmd.type==='cancelCollect') {
        syncPending=false; if (window.DekaLibrary) DekaLibrary.cancel(); value=true;
      } else if (window.__deka) value=await window.__deka.cmd(cmd);
    } catch (_) { send('error', {reason:'source-command-error'}); }
    if (id) send('reply', {id:id,value:value});
    return value;
  }};
  [['session','session'],['library','library'],['vk:state','state'],['vk:ended','ended'],['playback-confirmed','confirmed'],['playback-error','error']].forEach(function (pair) {
    window.addEventListener('deka2:'+pair[0], function (e) { send(pair[1],e.detail); });
  });
  window.addEventListener('deka2:library-scan',function(e){send('activity',{active:!!e.detail.active});});
  function boot() {
    domReady=true;
    var box=document.createElement('div');box.id='deka2-source-return';
    box.style.cssText='position:fixed;bottom:12px;right:12px;z-index:2147483647';
    var sh=box.attachShadow({mode:'open'});
    sh.innerHTML='<style>section{font:13px system-ui;background:#151c25;color:#dce7f6;padding:9px;border-radius:7px;max-width:350px}button{font:14px system-ui;padding:10px;border:1px solid #bc8b2c;border-radius:7px;color:#f5b44b;background:#151c25;cursor:pointer}p{margin:5px 0 0;font-size:11px}</style><section><button>Вернуться в плеер «Дека 2»</button><p>Во время загрузки это окно остаётся открытым для догрузки VK. Ваш плеер — в отдельном окне.</p></section>';
    sh.querySelector('button').onclick=function(){send('return',{});};document.documentElement.appendChild(box);
    send('ready',{});snapshot();drainSync();
    var intent=window.DekaLibrary&&DekaLibrary.takePendingPlay();
    if(intent)DekaLibrary.playKey(intent.track.key,{side:intent.side,accountId:intent.accountId});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
