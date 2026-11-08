from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bundle='\n;\n'.join((ROOT/'src'/name).read_text()for name in ['library-engine.js', 'vinyl-processor.js', 'vinyl-engine.js', 'mix-analysis.js', 'mix-envelope.js', 'fx-processor.js', 'deck-effects.js', 'brake-processor.js', 'deck-brake.js', 'deck-engine.js', 'set-core.js', 'vk-bridge.js', 'library-runtime.js', 'virtual-list.js', 'console-controls.js', 'console-designs.js', 'mobile-overlay.js'])
fixture=(ROOT/'tests/fixtures/vk-music.html').read_text()
INIT='''
window.__audios=[];const NativeAudio=Audio;window.Audio=function(...args){const el=new NativeAudio(...args);__audios.push(el);return el;};Audio.prototype=NativeAudio.prototype;window.currentAudio=side=>__audios.find(el=>el.src===__dj.state[side].track?.url);window.__awake=[]; window.DekaAndroid={setBackChip:()=>{},hasSession:()=>true,keepAwake:on=>__awake.push(on),backgroundAllowed:()=>true};
Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;api.create=opts=>{
 const context=new AudioContext({sampleRate:48000}), analyser=context.createAnalyser();analyser.fftSize=32768;analyser.connect(context.destination);
 opts.context=context;opts.destination=analyser;window.__measure={context,analyser};window.__djopts=opts;return window.__dj=create(opts);
};}});
window.measure=(hz=440)=>{const {context,analyser}=__measure,x=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(x);let re=0,im=0,sum=0;
 for(let i=0;i<x.length;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(x.length-1)),a=2*Math.PI*hz*i/context.sampleRate; re+=x[i]*w*Math.cos(a);im+=x[i]*w*Math.sin(a);sum+=w;}
 return {amp:2*Math.hypot(re,im)/sum,peak:Math.max(...x.map(Math.abs))};};
'''
