/* Appearance only. No audio nodes, transport commands or page reloads. */
(function(){
  'use strict';
  const themes=[
    {id:'aurora',name:'Aurora Glass',description:'Бирюза, фиолетовый и мягкие поверхности'},
    {id:'acid',name:'Acid Terminal',description:'Чёрный фон, лайм и строгие линии'},
    {id:'editorial',name:'Editorial Mono',description:'Светлая бумага, чёрный и оранжевый'}
  ];
  const key='deka:desktop-theme';
  let saved='aurora';
  try{const value=localStorage.getItem(key);if(themes.some(t=>t.id===value))saved=value;}catch{}
  function apply(id){
    if(!themes.some(t=>t.id===id))return;
    themes.forEach(t=>document.documentElement.classList.toggle('deka-theme-'+t.id,t.id===id));
  }
  apply(saved);
  window.DekaAppearance={init(root){
    const dialog=document.createElement('dialog');dialog.id='djThemeDialog';dialog.className='dj-theme-dialog';
    dialog.setAttribute('aria-labelledby','djThemeTitle');
    dialog.innerHTML='<h2 id="djThemeTitle">Выберите свой стиль</h2><p>Посмотрите, как выглядит пульт. Музыка продолжает играть.</p><div class="dj-theme-options"></div><div class="dj-theme-actions"><button class="btn" id="djThemeCancel">Отмена</button><button class="btn open" id="djThemeSave">Сохранить стиль</button></div>';
    root.appendChild(dialog);
    let pending=saved;
    const select=id=>{pending=id;apply(id);dialog.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===id)));};
    for(const theme of themes){
      const b=document.createElement('button');b.className='dj-theme-card';b.dataset.theme=theme.id;b.type='button';
      b.innerHTML='<span class="dj-theme-swatch" aria-hidden="true"><i></i><i></i><i></i></span><strong></strong><small></small>';
      b.querySelector('strong').textContent=theme.name;b.querySelector('small').textContent=theme.description;
      b.onclick=()=>select(theme.id);dialog.querySelector('.dj-theme-options').appendChild(b);
    }
    document.getElementById('djStyle').onclick=()=>{select(saved);dialog.showModal();};
    document.getElementById('djThemeCancel').onclick=()=>{apply(saved);dialog.close();};
    document.getElementById('djThemeSave').onclick=()=>{saved=pending;try{localStorage.setItem(key,saved);}catch{}dialog.close();};
    dialog.addEventListener('close',()=>{if(dialog.open)return;apply(saved);document.getElementById('djStyle').focus();});
    dialog.addEventListener('cancel',()=>apply(saved));
  }};
})();
