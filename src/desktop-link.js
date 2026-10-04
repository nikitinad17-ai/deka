/* Local player transport. VK lives in another WebView, never replaces this page.
 * Preserve in-flight import across navigation and never hide its viewport mid-scan. */
(function () {
  'use strict';
  if (!window.DEKA_DESKTOP_SHELL) return;
  var session={id:'',authenticated:null},lib={items:[],status:'loading',reason:'connecting',source:'unknown|',complete:false};
  var diagnostics={},media={},pending=new Map(),serial=0,ready=false,autoAccount='',manualSource=false,lastSeen=0;
  var api=window.__TAURI__,busy=false,scanObserved=false,loginPrompted=false,syncStarted=0,progressAt=0,progressCount=0;
  function event(name,data){window.dispatchEvent(new CustomEvent('deka2:'+name,{detail:data}));}
  function status(reason){lib=Object.assign({},lib,{status:'partial',complete:false,reason:reason});event('library',lib);}
  function invoke(name,args){return api.core.invoke(name,args);}
  function command(cmd){
    if(cmd.type==='fx')return Promise.resolve(false);
    if(!ready&&cmd.type!=='ping'){status('source-not-ready');return Promise.resolve(false);}
    if(['collectMy','collectAll','openMy'].includes(cmd.type)){
      if(busy)return Promise.resolve(true);
      busy=true;scanObserved=false;syncStarted=progressAt=Date.now();progressCount=lib.items.length;
      lib=Object.assign({},lib,{status:'loading',reason:'opening-personal-list',complete:false});event('library',lib);
      // Rust makes source visible BEFORE dispatching sync; no hide/session race.
      return invoke('source_cmd',{cmd:{type:'sync'},requestId:null}).then(()=>true).catch(()=>{busy=false;status('source-link-error');return false;});
    }
    if(cmd.type==='playKey'||cmd.type==='play'){
      if(cmd.type==='playKey')busy=false;
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
  function showSource(show,manual){if(manual!==undefined)manualSource=manual;return invoke('source_show',{show:!!show,keepVisible:busy}).catch(()=>status('source-window-error'));}
  function receive(envelope){
    var m=envelope&&envelope.payload;if(!m||m.protocol!==1||typeof m.kind!=='string')return;
    lastSeen=Date.now();ready=true;var d=m.data||{};
    if(m.kind==='session'){
      if(typeof d.id!=='string'||!['boolean','object'].includes(typeof d.authenticated))return;
      var previous=session.id;session=d;
      if(previous&&previous!==session.id){busy=false;lib={items:[],status:'loading',complete:false,source:(session.id||'unknown')+'|'};event('library',lib);pending.forEach((_,id)=>finish(id,false));}
      event('session',session);
      if(session.authenticated===false){busy=false;autoAccount='';status('login-required');if(!manualSource&&!loginPrompted){loginPrompted=true;showSource(true,false);}}
      if(session.authenticated===true&&session.id){
        loginPrompted=false;
        if(autoAccount!==session.id){autoAccount=session.id;command({type:'collectMy'});}
      }
    }else if(m.kind==='library'){
      if(!session.id||d.accountId!==session.id)return;
      var current=DekaLibraryCore.merge([],Array.isArray(d.items)?d.items.slice(0,30000):[]);
      var same=lib.accountId===d.accountId;
      // Intermediate saved/zero snapshots after a source navigation must not
      // erase rows already delivered to the player or finish an active sync.
      var terminal=d.status==='complete'||d.status==='partial';
      var next=Object.assign({},d,{items:current});
      if(same && !(d.complete&&d.reason==='count-matched'))next.items=DekaLibraryCore.merge(lib.items,current);
      if(next.items.length!==progressCount){progressCount=next.items.length;progressAt=Date.now();}
      if(d.status==='loading')scanObserved=true;
      if(busy && !terminal && d.status!=='loading')next.status='loading';
      next.count=next.items.length;lib=next;
      if(terminal)busy=false;
      event('library',lib);
      if(terminal&&!manualSource)showSource(false,false);
    }else if(m.kind==='activity'){
      if(d.active){busy=true;scanObserved=true;}
      else if(scanObserved&&lib.status!=='loading')busy=false;
    }else if(m.kind==='state'){media=d;event('vk:state',d);
    }else if(m.kind==='ended'){event('vk:ended',d);
    }else if(m.kind==='confirmed'){pending.forEach(function(p,id){if(p.key===d.key)finish(id,true);});
    }else if(m.kind==='error'){busy=false;event('playback-error',d);
    }else if(m.kind==='diagnostics'){diagnostics=d;
    }else if(m.kind==='reply'){if(!(d.value&&d.value.navigating))finish(d.id,d.value===true);
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
  function safeReport(){return {version:'0.2.5',connected:ready&&Date.now()-lastSeen<15000,signedIn:session.authenticated===true,
    ownPage:!!diagnostics.ownPage,preview:!!diagnostics.preview,visibility:diagnostics.visibility||'unknown',documentReady:diagnostics.documentReady||'unknown',
    rows:diagnostics.personalRows||0,nativeRows:diagnostics.nativeRowCount||0,excludedRows:diagnostics.excludedRows||0,
    saved:lib.items.length,expected:diagnostics.expected||lib.expected||null,complete:!!lib.complete,reason:lib.reason||'',
    scanning:busy,entryFound:!!diagnostics.entryFound,hasMore:!!diagnostics.hasMore,
    scrollTop:diagnostics.scrollTop||0,scrollHeight:diagnostics.scrollHeight||0,viewport:diagnostics.viewport||0,
    mediaFound:!!media.hasMedia,mediaError:media.mediaError||0,mediaReady:media.readyState||0};}
  window.DekaDesktop={showSource:()=>showSource(true,true),hideSource:()=>showSource(false,false),refresh:()=>command({type:'collectMy'}),report:safeReport,
    openSet:function(url){return invoke('source_video',{url:url}).catch(()=>status('source-link-error'));},connected:()=>ready&&Date.now()-lastSeen<15000};
  api.event.listen('deka2-source',receive).then(function(){return invoke('source_cmd',{cmd:{type:'ping'},requestId:null});}).catch(()=>status('source-link-error'));
  setInterval(function(){
    invoke('source_cmd',{cmd:{type:'ping'},requestId:null}).catch(()=>{});
    if(!ready||Date.now()-lastSeen>15000){if(!busy)status('source-not-ready');}
    if(busy&&Date.now()-progressAt>75000){busy=false;command({type:'cancelCollect'});status('source-stalled');}
  },5000);
})();
