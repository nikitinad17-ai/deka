const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Decks=require('../src/deck-engine.js');
function engine(){const calls=[],storage=new Map();const w={HTMLMediaElement:{prototype:{play(){}}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setInterval:()=>1,clearInterval(){}};w.globalThis=w;vm.runInNewContext(fs.readFileSync('src/deck-engine.js','utf8'),w);return {e:w.DekaDecks.create({vk:c=>{calls.push(c);return true;}}),calls,w};}
const track={key:'42_1',title:'Track',kind:'vk',duration:120};
test('crossfader endpoints produce exact zero, centre equal power',()=>{assert.deepEqual(Decks.weights(-1),[1,0]);assert.deepEqual(Decks.weights(1),[0,1]);for(let i=-100;i<=100;i++){const [a,b]=Decks.weights(i/100);assert.ok(Math.abs(a*a+b*b-1)<1e-12);}});
test('VK adopted from website immediately receives master and channel attenuation',()=>{const {e,calls}=engine();e.setMaster(.5);e.setGain('A',.4);e.setCross(-1);e.noteVK({title:'Live',paused:false,currentTime:0,duration:30});assert.equal(calls.filter(c=>c.type==='volume').at(-1).value,.2);e.setGain('A',0);assert.equal(calls.filter(c=>c.type==='volume').at(-1).value,0);e.destroy();});
test('muting and resetting affect audio commands, not just labels',async()=>{const{e,calls}=engine();e.load('A',[track],0);await e.play('A');e.mute('A');assert.equal(calls.filter(c=>c.type==='volume').at(-1).value,0);e.resetMixer();assert.ok(Math.abs(calls.filter(c=>c.type==='volume').at(-1).value-.8/Math.sqrt(2))<1e-12);e.destroy();});
test('shared VK ownership follows B, A fader cannot silently control it',async()=>{const{e,calls}=engine();e.load('B',[track],0);await e.play('B');e.setCross(1);e.setGain('B',.5);e.setGain('A',0);assert.equal(calls.filter(c=>c.type==='volume').at(-1).value,.4);e.setMaster(0);assert.equal(calls.filter(c=>c.type==='volume').at(-1).value,0);e.destroy();});
test('second tap during pending play cancels instead of dispatching another playKey',()=>{const{e,calls}=engine();e.load('A',[track],0);e.play('A');e.toggle('A');assert.equal(calls.filter(c=>c.type==='playKey').length,1);assert.equal(e.state.A.pending,false);assert.equal(e.state.A.paused,true);e.destroy();});
test('VK gain survives delayed first playing notification',async()=>{const{e,calls}=engine();e.load('A',[track],0);e.setGain('A',0);await e.play('A');e.noteVK({title:'Track',paused:false,currentTime:1,duration:120});assert.equal(calls.filter(c=>c.type==='volume').at(-1).value,0);e.destroy();});
test('master settings survive engine recreation in same app storage',()=>{const{e,w}=engine();e.setMaster(.37);e.setCross(.6);const next=w.DekaDecks.create({vk:()=>true});assert.equal(next.diagnostics().master,.37);assert.equal(next.diagnostics().cross,.6);e.destroy();next.destroy();});

test('VK user ID falls back to non-secret ID cookie without reading credentials',()=>{
  const w={location:{hostname:'vk.ru',pathname:'/audio'},document:{cookie:'remixmid=777',querySelectorAll:()=>[],readyState:'loading',addEventListener(){}},vk:{}};
  w.window=w;w.top=w;vm.runInNewContext(fs.readFileSync('src/vk-session.js','utf8'),w);
  assert.equal(w.DekaSession.userId(),'777');assert.equal(w.DekaSession.read().authenticated,true);
});
test('Own saved library is restored on landing page and isolated across users',()=>{
  const storage=new Map([['deka2:own-library:v3:777',JSON.stringify({schema:3,accountId:'777',sourcePath:'/audios777',source:'777|/audios777',items:[track],complete:true,count:1})]]);
  const w={location:{hostname:'vk.ru',pathname:'/audio',search:'',origin:'https://vk.ru'},document:{cookie:'',readyState:'loading',addEventListener(){}},vk:{id:777},DekaLibraryCore:require('../src/library-engine.js'),URL,localStorage:{getItem:k=>storage.get(k)||null},sessionStorage:{removeItem(){}}};
  w.window=w;w.top=w;w.__deka={cmd:()=>{}};vm.runInNewContext(fs.readFileSync('src/library-runtime.js','utf8'),w);
  assert.equal(w.DekaLibrary.get().count,1);assert.equal(w.DekaLibrary.ownURL().pathname,'/audios777');
  w.vk.id=888;assert.equal(w.DekaLibrary.get().count,0);
});
