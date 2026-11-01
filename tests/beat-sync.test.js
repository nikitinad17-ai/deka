const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../src/mix-analysis.js'),E=require('../src/mix-envelope.js');
const info=bpm=>({bpm,confidence:1,beatOffset:.14,rms:.2,bands:[.01,.01,.01]});
test('master BPM uses actual outgoing speed; half/double aliases stay within ±8%',()=>{
 assert.ok(Math.abs(A.plan(info(120),info(125),1).rate-.96)<1e-10);
 assert.ok(Math.abs(A.plan(info(120),info(125),1.04).rate-.9984)<1e-10);
 for(const bpm of [60,240]){const p=A.plan(info(120),info(bpm),1);assert.equal(p.matched,true);assert.equal(p.sourceBPM,120);assert.equal(p.rate,1);}
 assert.equal(A.plan(info(90),info(125),1).reason,'range');assert.equal(A.plan(info(90),info(125),1).matched,false);
 assert.equal(A.plan({bpm:null,confidence:0},info(125),1).reason,'no-bpm');
});
test('phase launch changes start time while preserving the exact user CUE',()=>{
 for(const cue of [0,30,70.12])for(const time of [8.17,24.32]){
  const a=info(120),b=info(125),r=.96,delay=A.launchDelay(time,a,cue,b,1,r),first=((b.beatOffset-cue)%(60/125)+60/125)%(60/125)/r;
  assert.ok(delay>=0&&delay<.5);const phase=((time+delay+first-a.beatOffset)%.5+.5)%.5;assert.ok(Math.min(phase,.5-phase)<1e-10);
 }
 assert.equal(A.launchDelay(10,{...info(120),phaseConfidence:0},0,info(125),1,.96),null);
});
test('17-second BPM mode moves EQ on one clock without prescribing independent tempo curves',()=>{
 const a=E.beat(0,[0,0,0],[-6,-3,-3]),b=E.beat(.5,[0,0,0],[-6,-3,-3]),c=E.beat(1,[0,0,0],[-6,-3,-3]);
 assert.deepEqual(a.outEQ,[0,0,0]);assert.deepEqual(b.outEQ,[-6,-6,-6]);assert.deepEqual(b.inEQ,[-3,-1.5,-1.5]);assert.ok(c.inEQ.every(x=>x===0));assert.equal(c.outRate,undefined);
});
