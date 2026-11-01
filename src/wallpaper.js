/* Separate native shell controller. It never creates or replaces an audio player. */
(function(){
 'use strict';
 const invoke=window.__TAURI__?.core?.invoke,listen=window.__TAURI__?.event?.listen;
 if(!invoke)return;
 const api=window.DekaWallpaper={mode:'normal',quiet:false,state:null};
 const bar=document.createElement('aside');bar.className='wallpaper-toolbar';bar.setAttribute('aria-label','Режим рабочего стола');
 bar.innerHTML='<strong>DEKA · Wallpaper <small>0.1.1 · RC1</small></strong><select id="wallMonitor" aria-label="Монитор"></select><button id="wallActive">Активно</button><button id="wallBackground">Фон</button><button id="wallNormal">Обычное окно · Esc</button><button id="wallReport">Сохранить отчёт</button><output id="wallState">Обычное окно</output>';
 document.body.prepend(bar);const $=id=>document.getElementById(id);
 function render(s){const previous=api.mode;api.state={...api.state,...s};api.mode=s.mode||api.mode;api.quiet=!!s.quiet;if(api.mode!==previous&&api.mode!=='normal')window.scrollTo(0,0);document.documentElement.dataset.wallpaperMode=api.mode;document.documentElement.classList.toggle('wallpaper-quiet',api.quiet);
  document.querySelector('.wrap').inert=api.mode==='background';bar.inert=api.mode==='background';
  if(s.monitors){$('wallMonitor').replaceChildren(...s.monitors.map((m,i)=>{const o=document.createElement('option');o.value=m.name;o.textContent=`${i+1} · ${m.width}×${m.height} · ${Math.round(m.scale*100)}%`;return o;}));}
  if(s.selected)$('wallMonitor').value=s.selected;
  for(const [id,mode]of[['wallActive','active'],['wallBackground','background'],['wallNormal','normal']])$(id).setAttribute('aria-pressed',String(api.mode===mode));
  $('wallState').textContent=s.error||({normal:'Обычное окно',active:'Активно · Esc — в окно',background:'Фон · управление в трее'}[api.mode]);
 }
 async function set(mode){try{render(await invoke('wallpaper_set',{mode,monitor:$('wallMonitor').value||null}));}catch(e){$('wallState').textContent=String(e);}}
 $('wallReport').onclick=async()=>{try{$('wallState').textContent='Сохранено: '+await invoke('wallpaper_report');}catch(e){$('wallState').textContent=String(e);}};
 $('wallActive').onclick=()=>set('active');$('wallBackground').onclick=()=>set('background');$('wallNormal').onclick=()=>set('normal');$('wallMonitor').onchange=()=>set(api.mode);
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&api.mode!=='background'){e.preventDefault();set('normal');}},true);
 for(const name of['click','pointerdown','pointermove','pointerup','wheel','keydown','keyup','drop','dragover','input','change'])window.addEventListener(name,e=>{if(api.mode==='background'){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
 listen('wallpaper:state',e=>render(e.payload));invoke('wallpaper_state').then(render).catch(e=>$('wallState').textContent=String(e));
})();
