/* Local desktop player: VK is a separate source WebView, never the player's DOM.
 * Commands are restricted by Rust to this local window. Remote text is rendered
 * via textContent / the existing escaped list. No credentials cross this link. */
(function () {
  'use strict';
  if (!window.DEKA_DESKTOP_SHELL) return;
  var session={id:'',authenticated:null}, lib={items:[],status:'loading',reason:'connecting',source:'unknown|',complete:false};
  var diagnostics={}, media={}, pending=new Map(), serial=0, ready=false, autoAccount='', manualSource=false, lastSeen=0;
  var api=window.__TAURI__, busy=false;
  function event(name,data){window.dispatchEvent(new CustomEvent('deka2:'+name,{detail:data}));}
  function status(reason){lib=Object.assign({},lib,{status:'partial',complete:false,reason:reason});event('library',lib);}
  function invoke(name,args){return api.core.invoke(name,args);}
  function command(cmd){
    if(cmd.type==='fx')return Promise.resolve(false);
    if(!ready&&cmd.type!=='ping'){status('source-not-ready');return Promise.resolve(false);}
    if(cmd.type==='collectMy'||cmd.type==='collectAll'||cmd.type==='openMy'){
      busy=true;lib=Object.assign({},lib,{status:'loading',reason:'opening-personal-list'});event('library',lib);
      return invoke('source_cmd',{cmd:{type:'sync'},requestId:null}).then(()=>true).catch(()=>{busy=false;status('source-link-error');return false;});
    }
    if(cmd.type==='playKey'||cmd.type==='play'){
      var id=String(++serial);
      return new Promise(function(resolve){
        var timer=setTimeout(function(){pending.delete(id);status('playback-timeout');resolve(false);},110000);
        pending.set(id,{resolve:resolve,timer:timer,key:cmd.key});
        invoke('source_cmd',{cmd:cmd,requestId:id}).catch(function(){finish(id,false);status('source-link-error');});
      });
    }
    return invoke('source_cmd',{cmd:cmd,requestId:null}).then(()=>true).catch(()=>false);
  }
  function finish(id,value){var p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);p.resolve(value);}
  function showSource(show,manual){if(manual!==undefined)manualSource=manual;return invoke('source_show',{show:!!show}).catch(()=>status('source-window-error'));}
  function receive(envelope){
    var m=envelope&&envelope.payload;if(!m||m.protocol!==1||typeof m.kind!=='string')return;
    lastSeen=Date.now();ready=true;var d=m.data||{};
    if(m.kind==='session'){
      if(typeof d.id!=='string'||!['boolean','object'].includes(typeof d.authenticated))return;
      var previous=session.id;session=d;
      if(previous&&previous!==session.id){lib={items:[],status:'loading',complete:false,source:(session.id||'unknown')+'|'};event('library',lib);pending.forEach((_,id)=>finish(id,false));}
      event('session',session);
      if(session.authenticated===false){busy=false;status('login-required');if(!manualSource)showSource(true,false);}
      if(session.authenticated===true&&session.id&&autoAccount!==session.id){
        autoAccount=session.id;if(!manualSource)showSource(false,false);
        command({type:'collectMy'});
      }
    }else if(m.kind==='library'){
      if(!session.id||d.accountId!==session.id)return;
      lib=Object.assign({},d,{items:DekaLibraryCore.merge([],Array.isArray(d.items)?d.items.slice(0,30000):[])});
      busy=d.status==='loading';event('library',lib);
    }else if(m.kind==='state'){media=d;event('vk:state',d);
    }else if(m.kind==='ended'){event('vk:ended',d);
    }else if(m.kind==='confirmed'){
      pending.forEach(function(p,id){if(p.key===d.key)finish(id,true);});
    }else if(m.kind==='error'){busy=false;event('playback-error',d);
    }else if(m.kind==='diagnostics'){diagnostics=d;
    }else if(m.kind==='reply'){
      if(!(d.value&&d.value.navigating))finish(d.id,d.value===true);
    }else if(m.kind==='return'){manualSource=false;showSource(false,false);
    }else if(m.kind==='ready'){command({type:'ping'});}
  }
  window.__deka={cmd:command,playback:()=>media};
  window.DekaSession={read:()=>session,userId:()=>session.id,refresh:()=>session};
  window.DekaLibrary={get:()=>lib,userId:()=>session.id,diagnostics:()=>diagnostics,
    collectMy:()=>command({type:'collectMy'}),collect:()=>command({type:'collectMy'}),
    cancel:function(){busy=false;command({type:'cancelCollect'});},isRunning:()=>busy,
    takePendingPlay:()=>null,ownPage:()=>false,landing:()=>false,ownURL:()=>null,
    playKey:(key,options)=>command(Object.assign({type:'playKey',key:key},options||{}))};
  window.DekaDesktop={showSource:()=>showSource(true,true),hideSource:()=>showSource(false,false),refresh:()=>command({type:'collectMy'}),
    openSet:function(url){return invoke('source_video',{url:url}).catch(()=>status('source-link-error'));},
    connected:()=>ready&&Date.now()-lastSeen<15000};
  api.event.listen('deka2-source',receive).then(function(){
    return invoke('source_cmd',{cmd:{type:'ping'},requestId:null});
  }).catch(()=>status('source-link-error'));
  setInterval(function(){
    invoke('source_cmd',{cmd:{type:'ping'},requestId:null}).catch(()=>{});
    if(!ready||Date.now()-lastSeen>15000)status('source-not-ready');
  },5000);
})();
