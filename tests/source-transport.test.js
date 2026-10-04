'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=process.env.DEKA_SOURCE_ROOT||path.join(__dirname,'..');
function desktop(){
 const calls=[],listeners={},jobs=[];let recv;
 const ctx={window:null,Date,Map,Promise,Number,Array,JSON,Object,String,console,
  CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},
  setTimeout:()=>1,clearTimeout:()=>{},setInterval:fn=>jobs.push(fn),
  DEKA_DESKTOP_SHELL:true,DekaLibraryCore:require('../src/library-engine.js'),
  dispatchEvent:e=>{(listeners[e.type]||[]).forEach(f=>f(e));},
  __TAURI__:{core:{invoke:(name,args)=>{calls.push({name,args});return Promise.resolve();}},event:{listen:(name,fn)=>{recv=fn;return Promise.resolve(()=>{});}}}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/desktop-link.js'),'utf8'),ctx);
 return {ctx,calls,jobs,send:(kind,data)=>recv({payload:{protocol:1,kind,data}})};
}
test('Account handshake never hides source immediately before import',()=>{
 const h=desktop();h.send('session',{id:'42',authenticated:true});
 assert.ok(h.calls.some(c=>c.name==='source_cmd'&&c.args.cmd.type==='sync'));
 assert.ok(!h.calls.some(c=>c.name==='source_show'&&c.args.show===false));
});
test('Navigation snapshot does not erase imported rows or finish active import',()=>{
 const h=desktop();h.send('session',{id:'42',authenticated:true});
 h.send('library',{accountId:'42',items:[{key:'42_1',title:'Mine'}],status:'loading',source:'42|/audio?section=all'});
 h.send('library',{accountId:'42',items:[],status:'saved',source:'42|/audio?section=all'});
 assert.equal(h.ctx.DekaLibrary.get().items.length,1);assert.equal(h.ctx.DekaLibrary.isRunning(),true);
});
test('Return to own player while importing retains native source viewport',()=>{
 const h=desktop();h.send('session',{id:'42',authenticated:true});h.send('return',{});
 const c=h.calls.findLast(c=>c.name==='source_show');assert.equal(c.args.show,false);assert.equal(c.args.keepVisible,true);
});
test('Matched complete snapshot permits replacement and releases source viewport',()=>{
 const h=desktop();h.send('session',{id:'42',authenticated:true});
 h.send('library',{accountId:'42',items:[{key:'42_1',title:'Mine'}],status:'loading',source:'42|/audio?section=all'});
 h.send('library',{accountId:'42',items:[{key:'42_2',title:'Other own song'}],status:'complete',complete:true,reason:'count-matched',expected:1,source:'42|/audio?section=all'});
 assert.equal(h.ctx.DekaLibrary.get().items[0].key,'42_2');assert.equal(h.ctx.DekaLibrary.isRunning(),false);
 assert.equal(h.calls.findLast(c=>c.name==='source_show').args.keepVisible,false);
});
test('Account switch discards old account rows',()=>{
 const h=desktop();h.send('session',{id:'42',authenticated:true});h.send('library',{accountId:'42',items:[{key:'42_1',title:'Mine'}],status:'loading',source:'42|'});
 h.send('session',{id:'43',authenticated:true});assert.equal(h.ctx.DekaLibrary.get().items.length,0);
 h.send('library',{accountId:'42',items:[{key:'42_1',title:'Old account'}],status:'saved'});assert.equal(h.ctx.DekaLibrary.get().items.length,0);
});
test('Safe report contains neither identity nor music/credential payloads',()=>{
 const h=desktop();h.send('session',{id:'42',authenticated:true});h.send('diagnostics',{personalRows:10,visibility:'visible',header:'SECRET TITLE',accountId:'SECRET ID',cookie:'SECRET COOKIE'});
 const r=JSON.stringify(h.ctx.DekaDesktop.report());assert.ok(!r.includes('SECRET'));assert.ok(r.includes('visible'));
});
test('Source queues a sync arriving before DOMContentLoaded',async()=>{
 const events={},button={},packets=[];let reads=0;
 const element={style:{},attachShadow:()=>({set innerHTML(v){},querySelector:()=>button})};
 const ctx={window:null,location:{hostname:'vk.ru'},Promise,console,
  document:{readyState:'loading',addEventListener:(n,fn)=>events[n]=fn,createElement:()=>element,documentElement:{appendChild:()=>{}}},
  addEventListener:()=>{},__TAURI__:{event:{emitTo:(t,n,p)=>{packets.push(p);return Promise.resolve();}}},
  DekaLibrary:{collectMy:async()=>{reads++;},get:()=>({items:[]}),diagnostics:()=>({}),isRunning:()=>false,takePendingPlay:()=>null},DekaSession:{read:()=>({id:'42',authenticated:true})}};
 ctx.window=ctx;ctx.top=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/source-link.js'),'utf8'),ctx);
 await ctx.DekaSource.receive({type:'sync'},null);assert.equal(reads,0);events.DOMContentLoaded();await Promise.resolve();await Promise.resolve();assert.equal(reads,1);
});
