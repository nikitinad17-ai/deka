const test=require('node:test');const assert=require('node:assert/strict');
const envelope=require('../src/mix-envelope.js');
const vm=require('node:vm'),fs=require('node:fs');
test('17-second fade reaches one third outgoing speed and neutral incoming controls',()=>{
  assert.equal(envelope.seconds,17);
  const first=envelope.at(0,1),last=envelope.at(1,1);
  assert.equal(first.outRate,1);assert.equal(first.inRate,.92);assert.deepEqual(first.inEQ,[-12,-12,-12]);
  assert.ok(Math.abs(last.outRate-1/3)<1e-12);assert.equal(last.inRate,1);
  assert.deepEqual(last.outEQ,[-12,-12,-12]);assert.ok(last.inEQ.every(v=>v===0));
});
test('all controls follow the same smooth progress, including pitched outgoing tracks',()=>{
  let prev=envelope.at(0,1.08,[4,-2,0]);
  for(let frame=1;frame<=1020;frame++){
    const next=envelope.at(frame/1020,1.08,[4,-2,0]);
    assert.ok(next.outRate<=prev.outRate&&next.inRate>=prev.inRate);
    assert.ok(Math.abs(next.outRate-prev.outRate)<.001);
    next.outEQ.forEach((v,i)=>assert.ok(v<=prev.outEQ[i]));
    next.inEQ.forEach((v,i)=>assert.ok(v>=prev.inEQ[i]));prev=next;
  }
  assert.ok(Math.abs(prev.outRate-.36)<1e-12);
});
test('TAP during an automatic slowdown reports the original BPM once',()=>{
  let now=0;
  const scope={HTMLMediaElement:{prototype:{play(){}}},performance:{now:()=>now},setInterval:()=>0,clearInterval(){}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/deck-engine.js'),'utf8'),scope);
  const deck=scope.DekaDecks.create({djMode:true});
  Object.assign(deck.state.A,{paused:false,rate:1,autoRate:.5});
  deck.tap('A');now=1000;deck.tap('A');
  assert.equal(deck.state.A.bpm,120);
});
