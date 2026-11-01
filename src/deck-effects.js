/* Six independent per-deck Web Audio effects. No external samples or extra timers. */
(function(){
  'use strict';
  const names=['Flanger','Echo','Reverb','Filter','Phaser','Roll'],modules=new WeakMap(),impulses=new WeakMap();
  function create(ctx,destination){
    const all=[],oscillators=[],stages={},input=ctx.createGain();all.push(input);
    let previous=input,disposed=false,bpm=120;
    const gain=()=>{const n=ctx.createGain();all.push(n);return n;};
    const delay=seconds=>{const n=ctx.createDelay(seconds);all.push(n);return n;};
    const biquad=(type,freq)=>{const n=ctx.createBiquadFilter();n.type=type;n.frequency.value=freq;all.push(n);return n;};
    const target=(param,value)=>param.setTargetAtTime(value,ctx.currentTime,.025);
    function lfo(freq,depth,param){const osc=ctx.createOscillator(),scale=gain();osc.frequency.value=freq;scale.gain.value=depth;osc.connect(scale).connect(param);osc.start();all.push(osc);oscillators.push(osc);return scale;}
    for(const name of names){
      const source=gain(),dry=gain(),wet=gain(),out=gain();wet.gain.value=0;
      previous.connect(source);source.connect(dry).connect(out);wet.connect(out);previous=out;
      stages[name]={source,dry,wet,out,on:false,amount:.35,status:'ready'};
    }
    previous.connect(destination);
    const flanger=stages.Flanger,fd=delay(.05),feedback=gain();fd.delayTime.value=.006;feedback.gain.value=.25;
    flanger.source.connect(fd);fd.connect(feedback).connect(fd);fd.connect(flanger.wet);
    flanger.depth=lfo(.28,.0035,fd.delayTime);flanger.feedback=feedback;
    const echo=stages.Echo,ed=delay(2.1),ef=gain(),echoTone=biquad('lowpass',4200);ed.delayTime.value=.5;ef.gain.value=.3;
    echo.source.connect(ed);ed.connect(echoTone).connect(ef).connect(ed);ed.connect(echo.wet);echo.feedback=ef;echo.delay=ed;
    const reverb=stages.Reverb,convolver=ctx.createConvolver();all.push(convolver);
    if(!impulses.has(ctx)){
      const impulse=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*3.6),ctx.sampleRate);let seed=17;
      for(let ch=0;ch<2;ch++){
        const data=impulse.getChannelData(ch);
        for(let i=0;i<data.length;i++){seed=(1664525*seed+1013904223)>>>0;const t=i/ctx.sampleRate;data[i]=(seed/2147483648-1)*.015*Math.exp(-t/1.1)*Math.min(1,t/.015);}
        [.027,.043,.069,.113,.179,.283,.431,.653,.977,1.47,2.21].forEach((t,i)=>{data[Math.round((t+ch*.004)*ctx.sampleRate)]+=(i%2?-.3:.3)*Math.exp(-t);});
        const energy=data.reduce((sum,v)=>sum+v*v,0),scale=Math.sqrt(1.2/energy);for(let i=0;i<data.length;i++)data[i]*=scale;
      }
      impulses.set(ctx,impulse);
    }
    convolver.normalize=false;convolver.buffer=impulses.get(ctx);reverb.source.connect(convolver).connect(reverb.wet);
    const filter=stages.Filter;filter.node=biquad('lowpass',18000);filter.node.Q.value=.8;filter.source.connect(filter.node).connect(filter.wet);
    const phaser=stages.Phaser,phases=[350,700,1400,2800].map(f=>biquad('allpass',f));let pp=phaser.source;
    phases.forEach(n=>{pp.connect(n);pp=n;});pp.connect(phaser.wet);phaser.depths=phases.map((n,i)=>lfo(.19,150*(i+1),n.frequency));
    const roll=stages.Roll;roll.status='loading';
    function update(name){
      if(disposed)return;
      const s=stages[name],amount=s.on?s.amount:0,ready=s.status==='ready',wet=ready?amount:0;
      target(s.dry.gain,name==='Filter'&&s.on?0:1-wet*.3);
      target(s.wet.gain,name==='Filter'&&s.on?1:wet*(name==='Echo'||name==='Reverb'?.5:.7));
      if(name==='Echo'||name==='Reverb'){
        const blend=ready?(name==='Echo'?.65*amount:.82*Math.pow(amount,1.15)):0;
        target(s.dry.gain,Math.sqrt(1-blend));target(s.wet.gain,Math.sqrt(blend)*(name==='Reverb'?.9:.95));
      }
      if(name==='Flanger'){target(s.depth.gain,.001+amount*.004);target(s.feedback.gain,.15+amount*.3);}
      if(name==='Echo'){target(s.feedback.gain,.12+.66*Math.pow(amount,.8));target(s.delay.delayTime,Math.min(2,60/bpm));}
      if(name==='Filter'){target(s.node.frequency,Math.max(180,18000*Math.pow(.01,s.amount)));target(s.node.Q,.7+s.amount*1.8);}
      if(name==='Phaser')s.depths.forEach((n,i)=>target(n.gain,(80+amount*250)*(i+1)));
      if(name==='Roll'&&s.processor)s.processor.port.postMessage({type:'config',on:s.on,amount:s.amount,bpm});
    }
    const mobile=!!window.DekaRollModuleSource;
    if(!modules.has(ctx))modules.set(ctx,(async()=>{
      if(!ctx.audioWorklet)return false;
      const url=mobile?URL.createObjectURL(new Blob([window.DekaRollModuleSource],{type:'application/javascript'})):new URL('fx-processor.js',document.baseURI).href;
      try{await ctx.audioWorklet.addModule(url);return true;}catch(error){if(!mobile)throw error;return false;}finally{if(mobile)URL.revokeObjectURL(url);}
    })());
    const ready=modules.get(ctx).then(worklet=>{
      if(disposed)return;
      let processor;
      if(worklet){processor=new AudioWorkletNode(ctx,'deka-roll',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
        processor.port.onmessage=({data})=>{if(data.type==='capture'){roll.captureFrames=data.frames;roll.captureRMS=data.rms;}};
      }else{
        if(!mobile||!ctx.createScriptProcessor)throw Error('Roll недоступен');
        const transport=new window.DekaRollTransport(ctx.sampleRate);processor=ctx.createScriptProcessor(512,2,2);
        transport.onCapture=data=>{roll.captureFrames=data.frames;roll.captureRMS=data.rms;};
        processor.onaudioprocess=event=>transport.render([0,1].map(i=>event.inputBuffer.getChannelData(i)),[0,1].map(i=>event.outputBuffer.getChannelData(i)));
        processor.port={postMessage:data=>transport.command(data),close:()=>{processor.onaudioprocess=null;}};roll.backend='compatibility';
      }
      all.push(processor);roll.processor=processor;roll.source.connect(processor).connect(roll.wet);roll.status='ready';update('Roll');
    }).catch(error=>{roll.status='error';roll.error=error.message;update('Roll');});
    return {input,ready,
      set(name,on,amount){const s=stages[name];if(!s)return false;s.on=!!on;s.amount=Math.max(0,Math.min(1,+amount||0));update(name);return s.status!=='error';},
      setBPM(value){const next=Math.round(Math.max(30,Math.min(300,+value||120)));if(next===bpm)return;bpm=next;update('Echo');update('Roll');},
      diagnostics(){return Object.fromEntries(names.map(n=>[n,{on:stages[n].on,amount:stages[n].amount,status:stages[n].status,backend:stages[n].backend||'web-audio',error:stages[n].error||'',captureFrames:stages[n].captureFrames||0,captureRMS:stages[n].captureRMS||0}]));},
      dispose(){if(disposed)return;disposed=true;if(roll.processor){roll.processor.port.postMessage({type:'dispose'});roll.processor.port.close();}oscillators.forEach(n=>n.stop());all.forEach(n=>n.disconnect());}
    };
  }
  window.DekaEffects={names,create};
})();
