/* Sticky mixer settings for VK's replaceable media element. Load after vk-bridge. */
(function(){
  'use strict';
  if(window.top!==window||!/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname))return;
  if(!window.__deka||window.__deka.mixerState)return;
  var original=window.__deka.cmd.bind(window.__deka),play=HTMLMediaElement.prototype.play;
  var desired=null,rate=1,media=null,watched=new WeakSet();
  function nativeView(){return window.DekaNativeView&&DekaNativeView.isNative();}
  window.addEventListener("deka2:view",function(e){if(e.detail.native)desired=null;});
  function apply(el){if(!el||nativeView())return;if(desired!==null)el.volume=desired;el.playbackRate=rate;el.preservesPitch=true;}
  function adopt(el){media=el;apply(el);if(watched.has(el))return;watched.add(el);
    el.addEventListener('playing',function(){if(el===media)apply(el);});
    el.addEventListener('loadedmetadata',function(){if(el===media)apply(el);});
    el.addEventListener('volumechange',function(){if(!nativeView()&&el===media&&desired!==null&&Math.abs(el.volume-desired)>.001)el.volume=desired;});
  }
  HTMLMediaElement.prototype.play=function(){
    if(this.tagName==='AUDIO'||(this.tagName==='VIDEO'&&(/vkvideo\.ru$/.test(location.hostname)||/^\/(video|clip)/.test(location.pathname))))adopt(this);
    return play.apply(this,arguments);
  };
  window.__deka.cmd=function(c){
    c=c||{};
    if(c.type==='volume'&&Number.isFinite(+c.value)){desired=Math.max(0,Math.min(1,+c.value));if(media)media.volume=desired;}
    if(c.type==='rate'&&Number.isFinite(+c.value)){rate=Math.max(.84,Math.min(1.16,+c.value));if(media)media.playbackRate=rate;return;}
    return original(c);
  };
  window.__deka.mixerState=function(){return {desiredVolume:desired,actualVolume:media?media.volume:null,rate:rate};};
})();
