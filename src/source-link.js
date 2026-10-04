/* Source-side relay only. This WebView contains VK, not the Deka interface.
 * No reading of passwords, authorization headers or auth cookies here. */
(function(){
  'use strict';
  if(window.top!==window||!/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)||window.DekaSource)return;
  var domReady=false;
  function send(kind,data){
    try{var p=window.__TAURI__.event.emitTo('main','deka2-source',{protocol:1,kind:kind,data:data});if(p&&p.catch)p.catch(()=>{});}catch(_){}
  }
  function snapshot(){
    if(!domReady)return;
    if(window.DekaSession)send('session',DekaSession.read());
    if(window.DekaLibrary){send('library',DekaLibrary.get());send('diagnostics',DekaLibrary.diagnostics());}
    if(window.__deka)send('state',window.__deka.playback());
  }
  var syncBusy=false;
  window.DekaSource={receive:async function(cmd,id){
    cmd=cmd||{};var value=false;
    try{
      if(cmd.type==='ping'){snapshot();value=true;}
      else if(cmd.type==='sync'){
        if(domReady&&window.DekaLibrary&&!syncBusy){syncBusy=true;Promise.resolve(DekaLibrary.collectMy()).catch(()=>send('error',{reason:'source-read-error'})).finally(()=>{syncBusy=false;snapshot();});}
        value=true;
      }else if(cmd.type==='cancelCollect'){if(window.DekaLibrary)DekaLibrary.cancel();value=true;}
      else if(window.__deka)value=await window.__deka.cmd(cmd);
    }catch(_){send('error',{reason:'source-command-error'});}
    if(id)send('reply',{id:id,value:value});
    return value;
  }};
  [['session','session'],['library','library'],['vk:state','state'],['vk:ended','ended'],['playback-confirmed','confirmed'],['playback-error','error']].forEach(function(pair){
    window.addEventListener('deka2:'+pair[0],function(e){send(pair[1],e.detail);});
  });
  function boot(){
    domReady=true;
    var box=document.createElement('div');box.id='deka2-source-return';
    box.style.cssText='position:fixed;bottom:12px;right:12px;z-index:2147483647';
    var sh=box.attachShadow({mode:'open'});sh.innerHTML='<style>button{font:14px system-ui;padding:12px;border:1px solid #bc8b2c;border-radius:7px;color:#f5b44b;background:#151c25;cursor:pointer}</style><button>Вернуться в плеер «Дека 2»</button>';
    sh.querySelector('button').onclick=()=>send('return',{});document.documentElement.appendChild(box);
    send('ready',{});snapshot();
    var intent=window.DekaLibrary&&DekaLibrary.takePendingPlay();
    if(intent)DekaLibrary.playKey(intent.track.key,{side:intent.side,accountId:intent.accountId});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
