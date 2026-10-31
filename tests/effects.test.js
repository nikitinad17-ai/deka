const test=require('node:test');const assert=require('node:assert/strict');
const {RollTransport}=require('../src/fx-processor.js');
test('Roll captures and repeats actual prior audio instead of replaying a UI animation',()=>{
  const sr=8000,r=new RollTransport(sr),block=128;let sample=0;const output=[];
  for(let b=0;b<48;b++){
    if(b===20)r.command({type:'config',on:true,amount:.6,bpm:120});
    const source=Float32Array.from({length:block},()=>Math.sin(++sample*.011)*(sample%997)/997),out=[new Float32Array(block),new Float32Array(block)];
    r.render([source],out);output.push(...out[0]);
  }
  const period=r.length-Math.min(32,Math.floor(r.length/8));let error=0;
  for(let i=output.length-800;i<output.length;i++)error+=Math.abs(output[i]-output[i-period]);
  assert.ok(error/800<.003);assert.ok(output.slice(-800).some(x=>Math.abs(x)>.1));
  assert.equal(r.ring[0].length,16000);
});
test('Roll switches back to live input, disposes its buffers and cannot leak sound',()=>{
  const r=new RollTransport(8000),input=[new Float32Array(128).fill(.3)],out=[new Float32Array(128)];
  r.command({type:'config',on:true,amount:1,bpm:120});for(let i=0;i<20;i++)r.render(input,out);
  r.command({type:'config',on:false,amount:1,bpm:120});for(let i=0;i<20;i++)r.render([new Float32Array(128).fill(-.2)],out);
  assert.ok(out[0].every(x=>Math.abs(x+.2)<1e-5));r.command({type:'dispose'});assert.equal(r.render(input,out),false);assert.ok(out[0].every(x=>x===0));
});
