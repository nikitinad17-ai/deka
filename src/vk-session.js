/* Only observes sign-in state. Never reads, stores or transmits credential values. */
(function () {
  'use strict';
  if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;
  if (window.DekaSession) return;
  function userId() {
    var v=window.vk||{}, candidates=[v.id,v.uid,v.user&&v.user.id];
    var cookie=document.cookie.match(/(?:^|;\s*)remixmid=(\d+)/);
    if(cookie)candidates.push(cookie[1]);
    for(var i=0;i<candidates.length;i++){var id=String(candidates[i]||'');if(/^[1-9]\d*$/.test(id))return id;}
    return '';
  }
  function read() {
    var authPage=/^(id|oauth|login)\.vk\.(com|ru)$/.test(location.hostname)||/^\/(login|join|restore|auth)(\/|$)/.test(location.pathname);
    var form=Array.from(document.querySelectorAll('input[type=password],form[action*=login],[data-testid=left_menu_login_button]')).some(function(n){return !!n.getClientRects().length;});
    var id=userId();
    return {id:id,authenticated:authPage||form?false:(id?true:null),authPage:authPage,hasLoginForm:form};
  }
  var last='',timer;
  function refresh(){var s=read(),key=JSON.stringify(s);if(last!==key){last=key;window.dispatchEvent(new CustomEvent('deka2:session',{detail:s}));}return s;}
  function boot(){refresh();new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(refresh,250);}).observe(document.body,{childList:true,subtree:true});}
  window.DekaSession={read:read,userId:userId,refresh:refresh};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
