// Passive visual surface only: no engine, transport handlers or audio elements.
(async function(){
 'use strict';
 const styles=document.createElement('div');document.head.append(styles);
 let previous='';
 await __TAURI__.event.listen('wallpaper:frame',({payload:p})=>{
  if(p.styles!==previous){styles.innerHTML=p.styles;previous=p.styles;}
  document.documentElement.className=p.rootClass;
  document.documentElement.dataset.wallpaperMode='background';
  document.body.className=p.bodyClass;document.body.innerHTML=p.html;
  document.body.inert=true;document.body.style.pointerEvents='none';
 });
 await __TAURI__.core.invoke('wallpaper_display_ready');
})();
