'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../src/deck-engine.js');
const set=(id,title='Saved set')=>({key:'set:video:'+id,kind:'set',setId:id,setKind:'video',title,artist:'VK Видео',duration:600});
function rig(){const commands=[];const engine=create({djMode:true,continuous:false,vk:async c=>{commands.push(c);return true;}});return {engine,commands};}
function state(engine,id,extra={}){engine.noteVK({setId:id,title:'Actual video title',artist:'DJ',hasMedia:true,paused:false,currentTime:42,duration:600,playbackRate:1,...extra});}

test('loading a set is silent; Play opens a video and matching metadata controls the deck',async()=>{
 const {engine:e,commands:c}=rig();e.load('B',[set('-1_2')],0);
 assert.equal(c.some(x=>x.type==='openSet'),false);assert.equal(e.state.B.status,'ready');
 await e.play('B');assert.deepEqual(c.find(x=>x.type==='openSet'),{type:'openSet',id:'-1_2',kind:'video'});
 state(e,'-8_9');assert.equal(e.state.B.pending,true);assert.equal(e.state.B.time,0);
 state(e,'-1_2');assert.equal(e.state.B.pending,false);assert.equal(e.state.B.paused,false);
 assert.equal(e.state.B.track.title,'Actual video title');assert.equal(e.state.B.time,42);
 e.pause('B');
});
test('pause, seek and resume keep the same video instead of navigating from the start',async()=>{
 const {engine:e,commands:c}=rig();e.load('A',[set('-1_2')],0);await e.play('A');state(e,'-1_2');
 e.pause('A');state(e,'-1_2');assert.equal(e.state.A.paused,true);
 e.seek('A',120);assert.deepEqual(c.at(-1),{type:'seek',time:120});
 await e.play('A');assert.equal(c.filter(x=>x.type==='openSet').length,1);assert.equal(c.at(-1).type,'play');
 state(e,'-1_2',{currentTime:120});assert.equal(e.state.A.time,120);e.pause('A');
});
test('pause during navigation rejects late autoplay',async()=>{
 const {engine:e,commands:c}=rig();e.load('A',[set('-1_2')],0);await e.play('A');e.pause('A');
 const n=c.length;state(e,'-1_2');assert.equal(e.state.A.paused,true);assert.equal(c.length,n+1);assert.equal(c.at(-1).type,'pause');
});
test('set ownership switches between decks; stale states and ended events cannot advance another set',async()=>{
 const {engine:e,commands:c}=rig();e.load('A',[set('-1_2')],0);await e.play('A');state(e,'-1_2');
 e.load('B',[set('-3_4')],0);await e.play('B');assert.equal(e.state.A.paused,true);
 state(e,'-1_2');assert.equal(e.state.B.time,0);state(e,'-3_4');
 e.endedVK({setId:'-1_2'});await new Promise(r=>setTimeout(r,75));assert.equal(e.state.B.paused,false);
 e.setCross(-1);const volume=c.filter(x=>x.type==='volume').at(-1).value;assert.ok(volume<1e-8);
 e.setCross(1);assert.ok(c.filter(x=>x.type==='volume').at(-1).value>.5);e.pause('B');
});
test('seeking an unstarted set never seeks the other remote deck',async()=>{
 const {engine:e,commands:c}=rig();e.load('A',[set('-1_2')],0);await e.play('A');state(e,'-1_2');
 e.load('B',[set('-3_4')],0);const n=c.length;e.seek('B',77);assert.equal(c.slice(n).some(x=>x.type==='seek'),false);
 await e.play('B');state(e,'-3_4');assert.ok(c.some(x=>x.type==='seek'&&x.time===77));assert.equal(e.state.B.time,77);e.pause('B');
});
test('failed remote invocation releases the play button',async()=>{
 const e=create({djMode:true,vk:async()=>false});e.load('A',[set('-1_2')],0);
 assert.equal(await e.play('A'),false);assert.equal(e.state.A.pending,false);assert.equal(e.state.A.paused,true);
});
