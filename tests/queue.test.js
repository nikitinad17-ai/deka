'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nextIndex}=require('../src/deck-engine.js');
const list=['A','B','C','D'];
test('continuous queue wraps in both directions and handles an empty/singleton queue',()=>{
 assert.equal(nextIndex([],0,1,false),-1);
 assert.equal(nextIndex(['one'],0,1,true),0);
 let index=0,visited=[];for(let n=0;n<10;n++){visited.push(list[index]);index=nextIndex(list,index,1,false);}
 assert.deepEqual(visited,['A','B','C','D','A','B','C','D','A','B']);
 assert.equal(nextIndex(list,0,-1,false),3);
 assert.equal(nextIndex(list,-1,1,false),0);
});
test('shuffle can select every other item and never immediately repeats the playing track',()=>{
 for(let index=0;index<list.length;index++){
  const choices=new Set();
  for(let n=0;n<100;n++){const next=nextIndex(list,index,1,true,()=>n/100);assert.notEqual(next,index);assert.ok(next>=0&&next<list.length);choices.add(next);}
  assert.equal(choices.size,list.length-1);
 }
 assert.equal(nextIndex(list,-1,1,true,()=>0),0);
 assert.equal(nextIndex(list,-1,1,true,()=>.999),3);
});
