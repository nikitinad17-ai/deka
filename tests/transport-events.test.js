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

test('one VK stream advances A to B to A exactly once without a DJ overlap',async()=>{
  const list=['one','two','three'].map(key=>({key:'vk-'+key,title:key,kind:'vk'})),starts=[];
  let engine;
  engine=create({djMode:true,continuous:true,autoMix:true,beatMix:true,vk:async command=>{
    if(command.type==='playKey'){
      starts.push(command.key);
      const track=list.find(t=>t.key===command.key);
      queueMicrotask(()=>engine.noteVK({title:track.title,paused:false,currentTime:0,duration:180,playbackRate:1}));
    }
    return true;
  }});
  engine.load('A',list,0);await engine.play('A');
  engine.endedVK();engine.endedVK();
  await new Promise(resolve=>setTimeout(resolve,90));
  assert.deepEqual(starts,['vk-one','vk-two']);
  assert.equal(engine.state.A.paused,true);assert.equal(engine.state.B.paused,false);
  assert.equal(engine.diagnostics().mixing,false);
  engine.endedVK();engine.endedVK();
  await new Promise(resolve=>setTimeout(resolve,90));
  assert.deepEqual(starts,['vk-one','vk-two','vk-three']);
  assert.equal(engine.state.A.paused,false);assert.equal(engine.state.B.paused,true);
  assert.equal(engine.diagnostics().vkSide,'A');
  assert.equal(engine.diagnostics().mixing,false);
});
