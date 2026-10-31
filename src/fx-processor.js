/* Bounded stereo beat roll; captures only the last beat, never a complete track. */
(function installRoll(root){
  'use strict';
  class RollTransport{
    constructor(sr){this.sr=sr;this.max=Math.ceil(sr*2);this.ring=[new Float32Array(this.max),new Float32Array(this.max)];this.loop=[new Float32Array(this.max),new Float32Array(this.max)];this.write=0;this.filled=0;this.position=0;this.length=0;this.wanted=Math.round(sr/4);this.enabled=false;this.pending=false;this.envelope=0;this.disposed=false;}
    command(d){
      if(d.type==='dispose'){this.disposed=true;this.enabled=false;this.ring=[];this.loop=[];this.length=0;return;}
      if(d.type==='config'){
        const amount=Math.max(0,Math.min(1,+d.amount||0)),division=[1,2,4,8][Math.min(3,Math.floor(amount*4))];
        const wanted=Math.max(128,Math.min(this.max-64,Math.round(this.sr*60/Math.max(30,Math.min(300,+d.bpm||120))/division)));
        if(d.on&&(!this.enabled||wanted!==this.wanted))this.pending=true;
        this.enabled=!!d.on;this.wanted=wanted;
      }
    }
    render(input,output){
      if(this.disposed){output.forEach(c=>c.fill(0));return false;}
      const count=output[0].length;
      for(let i=0;i<count;i++){
        for(let ch=0;ch<2;ch++)this.ring[ch][this.write]=(input[ch]||input[0])?.[i]||0;
        this.write=(this.write+1)%this.max;this.filled=Math.min(this.max,this.filled+1);
        if(this.enabled&&this.pending&&this.filled>=this.wanted){
          this.length=this.wanted;
          const start=(this.write-this.length+this.max)%this.max,first=Math.min(this.length,this.max-start);
          for(let ch=0;ch<2;ch++){this.loop[ch].set(this.ring[ch].subarray(start,start+first));if(first<this.length)this.loop[ch].set(this.ring[ch].subarray(0,this.length-first),first);}
          if(this.onCapture){let energy=0;for(let j=0;j<this.length;j++)energy+=this.loop[0][j]*this.loop[0][j];this.onCapture({frames:this.length,rms:Math.sqrt(energy/this.length)});}
          this.position=0;this.pending=false;
        }
        this.envelope+=((this.enabled&&this.length&&!this.pending?1:0)-this.envelope)*.01;
        const seam=Math.min(32,Math.floor(this.length/8)),blend=this.position>=this.length-seam?(this.position-(this.length-seam))/Math.max(1,seam):0;
        for(let ch=0;ch<output.length;ch++){
          const live=(input[ch]||input[0])?.[i]||0,pcm=this.loop[Math.min(ch,1)];
          const rolled=this.length?(pcm[this.position]*(1-blend)+(blend?pcm[this.position-(this.length-seam)]*blend:0)):0;
          output[ch][i]=live*(1-this.envelope)+rolled*this.envelope;
        }
        if(this.length&&++this.position>=this.length)this.position=seam;
      }
      return true;
    }
  }
  if(typeof registerProcessor==='function'&&typeof AudioWorkletProcessor!=='undefined'){
    class RollProcessor extends AudioWorkletProcessor{
      constructor(){super();this.transport=new RollTransport(sampleRate);this.transport.onCapture=data=>this.port.postMessage({type:'capture',...data});this.port.onmessage=({data})=>this.transport.command(data);}
      process(inputs,outputs){return this.transport.render(inputs[0]||[],outputs[0]);}
    }
    registerProcessor('deka-roll',RollProcessor);
  }else if(typeof module==='object'&&module.exports)module.exports={RollTransport};
  else root.DekaRollTransport=RollTransport;
})(globalThis);
