/* Live tape-stop routing; no whole-file decoding and no per-effect JS timer. */
(function(){
  'use strict';
  const modules=new WeakMap();
  window.DekaBrake={create(ctx,destination,onmessage){
    const input=ctx.createGain();input.connect(destination);let node=null,disposed=false,status='loading';
    if(!modules.has(ctx))modules.set(ctx,ctx.audioWorklet?ctx.audioWorklet.addModule(new URL('brake-processor.js',document.baseURI).href):Promise.reject(Error('AudioWorklet недоступен')));
    const ready=modules.get(ctx).then(()=>{
      if(disposed)return;
      node=new AudioWorkletNode(ctx,'deka-brake',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
      node.port.onmessage=({data})=>{if(!disposed)onmessage(data);};
      input.disconnect(destination);input.connect(node).connect(destination);status='ready';
    }).catch(()=>{status='error';});
    return {input,ready,get status(){return status;},
      start(id,seconds){if(status!=='ready'||disposed)return false;node.port.postMessage({type:'brake',id,seconds});return true;},
      stop(){if(node)node.port.postMessage({type:'release'});},
      dispose(){disposed=true;input.disconnect();if(node){node.port.postMessage({type:'dispose'});node.disconnect();node.port.close();}}
    };
  }};
})();
