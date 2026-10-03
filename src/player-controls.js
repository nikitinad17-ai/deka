/* UI controls shared by desktop and Android. No credential or audio downloads. */
(function () {
  'use strict';
  window.DekaControls={attach:function(o){
    var sh=o.shadow, app=o.app,engine=o.engine,$=function(id){return sh.getElementById(id);};
    var style=document.createElement('style');
    style.textContent=`
      .tools{flex-wrap:wrap}.mixer output{font-size:10px;color:#f5b44b;display:block}
      .mixer input[type=range]{touch-action:none}.mix-extra{display:flex;gap:3px;width:100%;justify-content:center}
      .mix-extra button{min-width:28px}.mute-on{background:#623623!important;color:#fff}
      .meter{width:100%;height:4px;background:#081013;border-radius:2px;overflow:hidden;display:block;margin:2px 0}
      .meter i{display:block;width:0;height:100%;background:#66d6e5;transition:width .05s linear}
      .deckextra{display:flex;gap:4px;align-items:center;padding:3px 6px;flex:none;flex-wrap:wrap}
      .deckextra button{min-height:25px;font-size:10px;padding:2px 5px}.deckextra .tempo{display:flex;gap:3px;flex:1;align-items:center;min-width:95px;font-size:10px}
      .deckextra .tempo input{width:60px;flex:1;touch-action:none}.deckextra output{min-width:34px}.deckextra .active{background:#5a4421}
      .filefx{display:flex;gap:4px;align-items:center;width:100%;font-size:9px}.filefx input{touch-action:none;flex:1}
      .session-note{font-size:10px;opacity:.75;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(min-width:720px){.console{grid-template-columns:minmax(0,1fr) 102px minmax(0,1fr)}}
      @media(min-width:1024px) and (min-height:600px){.console{grid-template-columns:minmax(0,1fr) 140px minmax(0,1fr);gap:12px;padding:10px}.disc{width:110px;height:110px}.disc:after{inset:37px}.mixer .fader{height:125px}.mixer label{font-size:12px}.mixer .eq input{height:26px}.deckextra button{min-height:30px;font-size:11px}.deck h2{padding:7px 10px}}
      @media(max-height:440px){.deckextra{gap:2px;padding:1px 5px}.deckextra button{min-height:22px}.deckextra .tempo{min-width:70px}.mixer{gap:1px}.mixer .fader{height:47px}.mixer label{font-size:8px}.mixer .eq input{height:14px}.mixer .filefx{display:none}}
    `;sh.appendChild(style);
    var mixer=sh.querySelector('.mixer');
    var snapshot=engine.diagnostics();$('cross').value=Math.round(snapshot.cross*100);$('master').value=Math.round(snapshot.master*100);
    ['A','B'].forEach(function(side){
      var fader=sh.querySelector('[data-gain='+side+']');fader.value=Math.round(engine.state[side].gain*100);
      var out=document.createElement('output');out.id='gainValue'+side;fader.after(out);
      var vu=document.createElement('span');vu.className='meter';vu.innerHTML='<i></i>';vu.id='vu'+side;out.after(vu);
      sh.querySelectorAll('[data-eq='+side+']').forEach(function(el){el.value=engine.state[side].eq[+el.dataset.band];});
      var deck=sh.querySelector('.deck[data-side='+side+']'),extra=document.createElement('div');extra.className='deckextra';
      extra.innerHTML=[0,1,2].map(function(i){return '<button data-hot="'+i+'" data-side="'+side+'" title="Первое нажатие: сохранить точку, следующие: перейти; Shift: перезаписать">C'+(i+1)+'</button>';}).join('')+
        '<button data-loop="4" data-side="'+side+'" title="Петля 4 секунды — свои файлы">↻4с</button><button data-loop="8" data-side="'+side+'" title="Петля 8 секунд — свои файлы">↻8с</button>'+
        '<label class="tempo">TEMPO <input type="range" min="-16" max="16" step="0.1" value="0" data-rate="'+side+'" aria-label="Темп '+side+'"><output id="rateValue'+side+'">0%</output></label>';
      deck.querySelector('.seek').after(extra);
      var filter=document.createElement('label');filter.className='filefx';filter.innerHTML='FILTER '+side+'<input type="range" min="-100" max="100" value="0" data-filter="'+side+'" aria-label="Фильтр '+side+'">';mixer.insertBefore(filter,$('djFiles'));
    });
    var masterOut=document.createElement('output');masterOut.id='masterValue';$('master').after(masterOut);
    var crossOut=document.createElement('output');crossOut.id='crossValue';crossOut.style.cssText='font-size:10px;min-width:50px';$('cross').after(crossOut);
    var extras=document.createElement('div');extras.className='mix-extra';extras.innerHTML='<button id="muteA">M A</button><button id="muteB">M B</button><button id="resetMix" title="Master 80%, каналы 100%, центр">Сброс</button>';mixer.insertBefore(extras,$('djFiles'));
    $('muteA').onclick=function(){engine.mute('A');};$('muteB').onclick=function(){engine.mute('B');};
    $('resetMix').onclick=function(){engine.resetMixer();$('cross').value=0;$('master').value=80;sh.querySelectorAll('[data-gain]').forEach(function(e){e.value=100;});sh.querySelectorAll('[data-eq],[data-filter],[data-rate]').forEach(function(e){e.value=0;});};
    sh.addEventListener('input',function(e){var el=e.target;if(el.dataset.rate)engine.setRate(el.dataset.rate,1+(+el.value)/100);if(el.dataset.filter)engine.setFilter(el.dataset.filter,+el.value/100);});
    sh.addEventListener('click',function(e){var b=e.target.closest('[data-hot],[data-loop]');if(!b)return;if(b.dataset.hot!==undefined)engine.hotCue(b.dataset.side,+b.dataset.hot,e.shiftKey);else engine.loop(b.dataset.side,+b.dataset.loop);});
    sh.addEventListener('dblclick',function(e){var el=e.target;if(el.id==='cross'){el.value=0;engine.setCross(0);}if(el.dataset.rate){el.value=0;engine.setRate(el.dataset.rate,1);}});
    var stopped=false,frame,last=0;
    function paint(now){if(stopped)return;frame=requestAnimationFrame(paint);if(now-last<60)return;last=now;
      var d=engine.diagnostics(),v=engine.levels();
      $('masterValue').textContent=Math.round(d.master*100)+'%';$('crossValue').textContent=d.cross===0?'A • B':d.cross<0?'A '+Math.round(-d.cross*100)+'%':'B '+Math.round(d.cross*100)+'%';
      ['A','B'].forEach(function(side){var s=engine.state[side];sh.querySelectorAll('[data-eq='+side+'],[data-filter='+side+']').forEach(function(el){el.disabled=!!s.track&&s.track.kind!=='file';el.title=el.disabled?'VK: безопасное прямое воспроизведение; EQ и фильтр доступны для своих файлов':'';});$('gainValue'+side).textContent=Math.round(s.gain*100)+'%';$('vu'+side).firstChild.style.width=Math.min(100,v[side]*400)+'%';
        $('rateValue'+side).textContent=((s.rate-1)*100).toFixed(1)+'%';$('mute'+side).classList.toggle('mute-on',s.muted);
        sh.querySelectorAll('[data-hot][data-side='+side+']').forEach(function(b){b.classList.toggle('active',s.hotCues[+b.dataset.hot]!==null);});
        sh.querySelectorAll('[data-loop][data-side='+side+']').forEach(function(b){b.classList.toggle('active',!!s.loop&&s.loop.seconds===+b.dataset.loop);b.disabled=!!s.track&&s.track.kind!=='file';});
      });
    }frame=requestAnimationFrame(paint);
    // Opening the real VK page never opens a custom password form.
    var account=document.createElement('div');account.className='accountbar';account.id='accountStatus';
    account.style.cssText='font-size:12px;padding:6px 10px;border-bottom:1px solid #343e4b;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    account.innerHTML='<span id="accountIdentity"></span><button id="accountPage" style="margin-left:auto;min-height:26px;font-size:11px">Это мой VK?</button>';
    app.querySelector('header').after(account);
    // Place this outside the absolute drawer too: the account is always explicit.
    var sheet=sh.querySelector('style');sheet.textContent+='\n.accountbar button{min-height:26px}.vkview>.accountbar{display:none}.app.djmode>.accountbar{display:none}';
    var lastAccount=null, autoStarted='', resumeTimer;
    function auth(s){
      var id=s.authenticated===true?s.id:'';
      if(lastAccount!==null&&lastAccount!==id)engine.clearVK();
      lastAccount=id;
      if(s.authPage){app.hidden=true;return;}app.hidden=false;
      $('vkBtn').textContent=s.authenticated===true?'VK ✓':'Войти VK';
      $('accountIdentity').textContent=id?('Аккаунт: '+(s.name?s.name+' · ':'')+'id'+id):
        (s.conflict?'VK сообщает разные аккаунты. Проверьте вход.':'Ваш аккаунт VK ещё не подтверждён. Откройте VK и войдите.');
      if(s.hasLoginForm){app.classList.add('vkview');$('backBtn').hidden=false;}
      if(s.conflict||s.authenticated!==true){$('syncBtn').disabled=true;}
    }
    // Show the actual logged-in profile, not a profile inferred from someone else's music.
    $('accountPage').onclick=function(){
      var id=DekaSession.read().id;
      if(id){var profile=new URL('/id'+id,location.origin);profile.hash='deka2-native';location.assign(profile.href);}
      else {$('vkBtn').click();}
    };
    function restoreRequested(){
      var intent=DekaLibrary.takePendingPlay&&DekaLibrary.takePendingPlay();
      if(!intent)return false;
      autoStarted=intent.accountId;
      var data=DekaLibrary.get().items||[],index=data.findIndex(function(t){return t.key===intent.track.key;});
      if(index<0){data=[intent.track];index=0;}
      engine.load(intent.side,data,index);engine.play(intent.side);return true;
    }
    function autoLibrary(s){
      if(s.authenticated!==true||s.authPage)return;
      if(restoreRequested())return;
      if(autoStarted===s.id)return;
      autoStarted=s.id;
      setTimeout(function(){
        if(DekaSession.read().id!==s.id||engine.state.A.track||engine.state.B.track||$('sourcemain').value==='files')return;
        if(DekaLibrary.landing())DekaLibrary.collectMy();
        else if(DekaLibrary.ownPage()&&!DekaLibrary.isRunning()&&!DekaLibrary.get().complete)DekaLibrary.collect();
      },1200);
    }
    if(window.DekaSession){var session=DekaSession.read();auth(session);autoLibrary(session);
      window.addEventListener('deka2:session',function(e){auth(e.detail);autoLibrary(e.detail);});}
    if(location.hash==='#deka2-native'){app.classList.add('vkview');$('backBtn').hidden=false;}
    var oldBack=$('backBtn').onclick;
    $('backBtn').onclick=function(){oldBack();if(window.DekaSession){var s=DekaSession.refresh();if(s.authenticated===true&&DekaLibrary.landing())DekaLibrary.collectMy();}};
    $('myBtn').textContent='Моя библиотека VK';
    $('syncBtn').onclick=function(){DekaLibrary.collectMy();};
    window.addEventListener('deka2:playback-error',function(e){
      var messages={'account-required':'Сначала подтвердите вход в свой VK.', 'open-own-library':'Нужно открыть свою библиотеку VK.',
        'playback-not-started':'VK не начал воспроизведение. Нажмите VK и включите трек на его странице.',
        'play-button-unavailable':'VK не показывает кнопку запуска этого трека.', 'track-not-found':'Трек не найден в вашей библиотеке VK.'};
      o.message(messages[e.detail.reason]||'VK не подтвердил запуск трека.');
    });
    window.addEventListener('deka2:library',function(e){var reasons={'identity-unknown':'Сначала войдите в свой VK','identity-conflict':'Аккаунт VK не подтверждён: откройте VK','login-required':'Войдите в свой аккаунт VK','open-own-library':'Рекомендации скрыты. Откройте «Моя библиотека VK»'};if(e.detail&&reasons[e.detail.reason])$('status').textContent=reasons[e.detail.reason];});
    // Library remains usable without a login for local files, but a detected login page is never covered.
    window.DekaApp={engine:engine,library:window.DekaLibrary,version:'0.2.1'};
    window.addEventListener('pagehide',function(){stopped=true;cancelAnimationFrame(frame);},{once:true});
  }};
  // The inherited UI has one engine. Attach extensions after it has mounted its DOM.
  var create=window.DekaDecks.create;
  window.DekaDecks.create=function(options){
    var engine=create(options);
    requestAnimationFrame(function(){
      var host=document.getElementById('deka2-overlay');
      if(!host||!host.shadowRoot||host.dataset.controlsReady)return;
      host.dataset.controlsReady='1';
      DekaControls.attach({engine:engine,shadow:host.shadowRoot,app:host.shadowRoot.querySelector('.app'),message:options.message});
    });
    return engine;
  };
})();
