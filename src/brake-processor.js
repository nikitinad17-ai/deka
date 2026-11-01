/* Bounded live PCM tape stop. The native decoder keeps feeding future samples. */
(function(root){
  'use strict';
  class BrakeTransport {
    constructor(rate){
      this.sampleRate=rate;this.capacity=Math.ceil(rate*8);this.channels=[new Float32Array(this.capacity),new Float32Array(this.capacity)];
      this.write=0;this.read=0;this.capture=0;this.active=false;this.stopped=false;this.disposed=false;this.speed=1;this.messages=[];
    }
    command(d){
      if(d.type==='brake'){
        if(!this.active){this.read=this.capture=this.write;this.speed=1;}
        this.id=d.id;this.startSpeed=this.speed;this.elapsed=0;this.frames=Math.max(1,Math.round(d.seconds*this.sampleRate));
        this.active=true;this.stopped=false;this.report=0;
      }
      if(d.type==='release'){this.active=false;this.stopped=false;this.speed=1;}
      if(d.type==='dispose'){this.active=false;this.disposed=true;this.channels=[];}
    }
    snapshot(type){return {type,id:this.id,speed:this.speed,elapsed:this.elapsed/this.sampleRate,duration:this.frames/this.sampleRate,seconds:(this.read-this.capture)/this.sampleRate};}
    render(input,out){
      if(this.disposed){out.forEach(c=>c.fill(0));return false;}
      const count=out[0].length;
      // Repeated presses can only decrease speed. Four seconds of future PCM suffice,
      // even if the stop is replaced many times; freeze capture before overwriting it.
      for(let i=0;i<count;i++){
        if(!this.active||this.write-this.capture<this.sampleRate*4.2){
          for(let ch=0;ch<2;ch++)this.channels[ch][this.write%this.capacity]=(input[ch]||input[0])?.[i]||0;
          this.write++;
        }
      }
      for(let i=0;i<count;i++){
        if(!this.active){for(let ch=0;ch<out.length;ch++)out[ch][i]=this.stopped?0:(input[ch]||input[0])?.[i]||0;continue;}
        const p=Math.min(1,this.elapsed/this.frames);this.speed=this.startSpeed*(1-p);
        const at=Math.floor(this.read),fraction=this.read-at,envelope=Math.min(1,this.speed/.12);
        for(let ch=0;ch<out.length;ch++){
          const data=this.channels[Math.min(ch,1)],a=data[at%this.capacity],b=data[(at+1)%this.capacity];
          out[ch][i]=(a+(b-a)*fraction)*envelope;
        }
        this.read+=this.speed;this.elapsed++;this.report++;
        this.speed=this.startSpeed*Math.max(0,1-this.elapsed/this.frames);
        if(this.elapsed>=this.frames){this.speed=0;this.active=false;this.stopped=true;this.messages.push(this.snapshot('ended'));}
        else if(this.report>=this.sampleRate*.04){this.report=0;this.messages.push(this.snapshot('progress'));}
      }
      return true;
    }
  }
  if(typeof registerProcessor==='function'&&typeof AudioWorkletProcessor!=='undefined'){
    class BrakeProcessor extends AudioWorkletProcessor{
      constructor(){super();this.transport=new BrakeTransport(sampleRate);this.port.onmessage=({data})=>this.transport.command(data);}
      process(inputs,outputs){const live=this.transport.render(inputs[0]||[],outputs[0]);for(const message of this.transport.messages){message.audioTime=currentTime+outputs[0][0].length/sampleRate;this.port.postMessage(message);}this.transport.messages.length=0;return live;}
    }
    registerProcessor('deka-brake',BrakeProcessor);
  }else if(typeof module==='object'&&module.exports)module.exports=BrakeTransport;
  else root.DekaBrakeTransport=BrakeTransport;
})(globalThis);
