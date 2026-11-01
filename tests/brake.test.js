const test=require('node:test'),assert=require('node:assert/strict');
const Brake=require('../src/brake-processor.js');
function render(t,frames,offset=0){const all=new Float32Array(frames);for(let at=0;at<frames;at+=128){const count=Math.min(128,frames-at),input=Float32Array.from({length:count},(_,i)=>.4*Math.sin(2*Math.PI*440*(offset+at+i)/t.sampleRate)),out=[new Float32Array(count)];t.render([input],out);all.set(out[0],at);}return all;}
function frequency(x,lo,hi,sr){let count=0;for(let i=Math.floor(lo*sr)+1;i<Math.floor(hi*sr);i++)if(x[i-1]<0&&x[i]>=0)count++;return count/(hi-lo);}
test('tape stop lowers real PCM pitch and stops at exactly 0.5 / 1 / 2 audio seconds',()=>{
 for(const duration of [.5,1,2]){const t=new Brake(48000);t.command({type:'brake',id:1,seconds:duration});const x=render(t,Math.ceil((duration+.1)*48000)),end=t.messages.filter(m=>m.type==='ended');
  assert.equal(end.length,1);assert.equal(end[0].elapsed,duration);assert.ok(Math.abs(end[0].seconds-duration/2)<1/48000);
  assert.ok(frequency(x,duration*.05,duration*.15,48000)>350);assert.ok(frequency(x,duration*.45,duration*.55,48000)<270);
  assert.ok(x.slice(Math.ceil(duration*48000)).every(v=>v===0));
 }
});
test('replacement preserves audible position and completes only the latest stop',()=>{
 const t=new Brake(48000);t.command({type:'brake',id:1,seconds:.5});render(t,12000);const before=t.read;t.command({type:'brake',id:2,seconds:2});assert.equal(t.read,before);render(t,96000,12000);
 const end=t.messages.filter(m=>m.type==='ended');assert.deepEqual(end.map(m=>m.id),[2]);assert.equal(end[0].elapsed,2);assert.ok(Math.abs(end[0].seconds-.6875)<.0001);
});
test('many replacements stay within bounded PCM storage without overwriting the slowed audio',()=>{
 const t=new Brake(1000);t.command({type:'brake',id:1,seconds:2});
 for(let i=0;i<1500;i++){t.command({type:'brake',id:i+2,seconds:2});const x=render(t,10,i*10);assert.ok(x.every(Number.isFinite));}
 assert.ok(t.read-t.capture<=2001);assert.ok(t.write-t.capture<=2201);assert.equal(t.channels[0].length,4000);
});
test('release restores live input and dispose drops all PCM',()=>{
 const t=new Brake(48000);t.command({type:'brake',id:1,seconds:2});render(t,4800);t.command({type:'release'});const input=[Float32Array.of(.1,.2,.3)],out=[new Float32Array(3)];t.render(input,out);assert.deepEqual(out[0],input[0]);
 t.command({type:'dispose'});assert.equal(t.render(input,out),false);assert.equal(t.channels.length,0);assert.ok(out[0].every(x=>x===0));
});
