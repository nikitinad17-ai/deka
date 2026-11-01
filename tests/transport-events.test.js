const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../src/deck-engine.js');

test('a remote ended event cannot finish a playing local deck',async()=>{
  const engine=create({djMode:true,continuous:false});
  Object.assign(engine.state.A,{track:{key:'mp3-a',kind:'file'},paused:false,status:'playing'});
  engine.endedVK();
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(engine.state.A.paused,false);
  assert.equal(engine.state.A.status,'playing');
});

test('a queued remote ended event cannot finish a replacement local track',async()=>{
  const engine=create({djMode:true,continuous:false});
  Object.assign(engine.state.A,{track:{key:'vk-a',kind:'vk'},paused:false,status:'playing'});
  engine.endedVK();
  Object.assign(engine.state.A,{track:{key:'mp3-a',kind:'file'},paused:false,status:'playing'});
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(engine.state.A.paused,false);
  assert.equal(engine.state.A.track.key,'mp3-a');
});
