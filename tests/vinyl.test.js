'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function processor() {
  let Processor;
  const sandbox={sampleRate:48000,AudioWorkletProcessor:class { constructor(){this.port={onmessage:null};} },registerProcessor:(_,C)=>Processor=C};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/vinyl-processor.js'),'utf8'),sandbox);
  const wrapper=new Processor(), p=wrapper.transport, pcm=Float32Array.from({length:48000},(_,i)=>i/48000-.5);
  const send=d=>wrapper.port.onmessage({data:d});send({type:'buffer',channels:[pcm]});
  const render=(blocks=1)=>{let samples=[];for(let j=0;j<blocks;j++){const out=[new Float32Array(128)];wrapper.process([],[out]);samples.push(...out[0]);}return samples;};
  return {p,send,render};
}
test('vinyl hold is silent; motion emits the selected PCM instead of an unrelated tone',()=>{
 const {send,render}=processor();send({type:'grab',position:24000});
 assert.ok(render(10).every(x=>x===0));send({type:'move',position:36000});
 assert.ok(render(10).some(x=>Math.abs(x)>.01));
});
test('reverse gesture reads asymmetric PCM in descending sample order',()=>{
 const {p,send,render}=processor();send({type:'grab',position:40000});send({type:'move',position:2000});
 render(4);const start=p.position, out=render(2);
 assert.ok(p.position<start-1000);assert.ok(out.at(-1)<out[0]-.01);
});
test('platter reversal changes actual PCM direction without leaving buffer bounds',()=>{
 const {p,send,render}=processor();send({type:'grab',position:20000});send({type:'move',position:40000});render(10);const forward=p.position;
 send({type:'move',position:-100000});const reverse=render(50);
 assert.ok(p.position<forward);assert.ok(p.position>=0);assert.ok(reverse.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
 send({type:'move',position:999999});render(100);assert.ok(p.position<48000);
});
test('release ramps to silence; dispose drops PCM storage',()=>{
 const {p,send,render}=processor();send({type:'grab',position:20000});send({type:'move',position:40000});render(5);
 send({type:'release'});const out=render(20);assert.ok(Math.abs(out.at(-1))<1e-5);
 send({type:'dispose'});assert.equal(p.channels.length,0);assert.ok(render(4).every(x=>x===0));
});
