/* Live tape-stop routing. Android bundles its processor, with a bounded CSP fallback. */
(function(){
  'use strict';
  const modules=new WeakMap();
  window.DekaBrake={create(ctx,destination,onmessage){
    const input=ctx.createGain(),mobile=!!window.DekaBrakeModuleSource;input.connect(destination);let node=null,disposed=false,status='loading',transport=null,backend='worklet';
    if(!modules.has(ctx))modules.set(ctx,(async()=>{
      if(!ctx.audioWorklet)return false;
      const url=mobile?URL.createObjectURL(new Blob([window.DekaBrakeModuleSource],{type:'application/javascript'})):new URL('brake-processor.js',document.baseURI).href;
      try{await ctx.audioWorklet.addModule(url);return true;}catch(error){if(!mobile)throw error;return false;}finally{if(mobile)URL.revokeObjectURL(url);}
    })());
    const ready=modules.get(ctx).then(worklet=>{
      if(disposed)return;
      if(worklet){
        node=new AudioWorkletNode(ctx,'deka-brake',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
        node.port.onmessage=({data})=>{if(!disposed)onmessage(data);};
      }else{
        if(!mobile||!ctx.createScriptProcessor)throw Error('PCM-обработка недоступна');
        backend='compatibility';transport=new window.DekaBrakeTransport(ctx.sampleRate);node=ctx.createScriptProcessor(512,2,2);
        node.onaudioprocess=event=>{
          transport.render([0,1].map(i=>event.inputBuffer.getChannelData(i)),[0,1].map(i=>event.outputBuffer.getChannelData(i)));
          for(const data of transport.messages){data.audioTime=event.playbackTime+event.outputBuffer.length/ctx.sampleRate;if(!disposed)onmessage(data);}transport.messages.length=0;
        };
      }
      input.disconnect(destination);input.connect(node).connect(destination);status='ready';
    }).catch(()=>{status='error';});
    const send=data=>{if(transport)transport.command(data);else if(node)node.port.postMessage(data);};
    return {input,ready,get status(){return status;},get backend(){return backend;},
      start(id,seconds){if(status!=='ready'||disposed)return false;send({type:'brake',id,seconds});return true;},
      stop(){send({type:'release'});},
      dispose(){disposed=true;input.disconnect();if(node){send({type:'dispose'});node.disconnect();if(node.port)node.port.close();node.onaudioprocess=null;}transport=null;}
    };
  }};
})();
