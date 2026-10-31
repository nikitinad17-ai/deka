'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../src/mix-analysis.js');
function beat(bpm,amp=1){const sr=12000,d=new Float32Array(sr*24),period=60/bpm;
 for(let i=0;i<d.length;i++){const t=i/sr,phase=(t-.14+period)%period;
  d[i]=amp*(.6*Math.sin(2*Math.PI*80*phase)*Math.exp(-phase*35)+.07*Math.sin(2*Math.PI*1400*t));}
 return A.analyzePCM(d,sr);}
test('onsets estimate actual 100/120/128/150 BPM drum patterns',()=>{
 for(const bpm of [100,120,128,150]){const a=beat(bpm);assert.ok(a.confidence>.32,JSON.stringify(a));assert.ok(Math.abs(a.bpm-bpm)<2,JSON.stringify({bpm,a}));}
});
test('no beat is invented for silence or a steady sine',()=>{
 assert.equal(A.analyzePCM(new Float32Array(12000*10),12000).bpm,null);
 const d=Float32Array.from({length:12000*10},(_,i)=>.3*Math.sin(2*Math.PI*440*i/12000));assert.equal(A.analyzePCM(d,12000).bpm,null);
});
test('automatic plan changes tempo and matches levels within explicit bounds',()=>{
 const a=beat(120,.5),b=beat(125,1),p=A.plan(a,b,1);
 assert.ok(Math.abs(p.rate-.96)<.02);assert.equal(p.matched,true);assert.ok(p.gain<.7&&p.gain>=.35);
 assert.ok(p.eq.every(x=>Number.isFinite(x)&&Math.abs(x)<=3));
 const far=A.plan(beat(100),beat(150),1);assert.ok(far.rate>=.92&&far.rate<=1.08);assert.equal(far.matched,false);
});
