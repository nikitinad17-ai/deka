/* Shared signed PCM scratch transport: worklet and bounded Android compatibility path. */
(function installVinyl(root) {
  'use strict';
  class VinylTransport {
    constructor(sampleRate) { this.sampleRate=sampleRate; this.channels=[]; this.position=0; this.target=0; this.active=false; this.velocity=0; this.envelope=0; }
    command(d) {
      if (d.type==='buffer') this.channels=d.channels;
      if (d.type==='grab') { this.position=this.target=d.position; this.velocity=0; this.active=true; }
      if (d.type==='move') this.target=d.position;
      if (d.type==='release') { this.active=false; this.velocity=0; }
      if (d.type==='dispose') { this.active=false; this.channels=[]; }
    }
    render(out) {
    const length = this.channels[0]?.length || 0;
    for (let i = 0; i < out[0].length; i++) {
      const distance = this.target - this.position;
      // Follow mouse position in ~12 ms, with real negative playback and no seek clicks.
      const wanted = this.active ? Math.max(-8, Math.min(8, distance / (this.sampleRate * .012))) : 0;
      this.velocity += (wanted - this.velocity) * .01;
      if (Math.abs(distance) < .05) this.velocity = 0;
      this.position = Math.max(0, Math.min(Math.max(0, length - 2), this.position + this.velocity));
      const moving = this.active && Math.abs(this.velocity) > .001;
      this.envelope += ((moving ? 1 : 0) - this.envelope) * .01;
      const at = Math.floor(this.position), fraction = this.position - at;
      for (let ch = 0; ch < out.length; ch++) {
        const pcm = this.channels[Math.min(ch, this.channels.length - 1)];
        out[ch][i] = pcm && length > 1 ? ((pcm[at] || 0) * (1 - fraction) + (pcm[at + 1] || 0) * fraction) * this.envelope : 0;
      }
    }
    }
  }
  if (typeof registerProcessor === 'function' && typeof AudioWorkletProcessor !== 'undefined') {
    class DekaVinylProcessor extends AudioWorkletProcessor {
      constructor() { super(); this.transport=new VinylTransport(sampleRate); this.port.onmessage=({data})=>this.transport.command(data); }
      process(inputs, outputs) { this.transport.render(outputs[0]); return true; }
    }
    registerProcessor('deka-vinyl', DekaVinylProcessor);
  } else {
    root.DekaVinylTransport=VinylTransport;
    root.DekaVinylModuleSource='('+installVinyl.toString()+')(globalThis);';
  }
})(globalThis);
