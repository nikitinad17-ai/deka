/* Restore the saved palette before first paint; mount one shared control surface. */
(function(){
  'use strict';
  const key='deka:desktop-theme';let saved='aurora';
  try{const s=localStorage.getItem(key);if(['aurora','acid','editorial'].includes(s))saved=s;}catch{}
  document.documentElement.classList.add('deka-theme-'+saved);
  window.DekaAppearance={init(root){return DekaConsoleDesigns.mount(root,{platform:'desktop',trigger:document.getElementById('djStyle'),key});}};
})();
