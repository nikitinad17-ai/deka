"""Delayed VK list mounting: choose host only after rows exist. No external requests."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];S=Path(os.environ.get('DEKA_SOURCE_ROOT',R));O=R/'test-output';O.mkdir(exist_ok=True)
results=[]
def check(name,ok):results.append({'test':name,'passed':bool(ok)});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
 page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<html><body><h2>Мои треки · 60</h2><div id="mount"></div></body></html>')
 page.evaluate('''()=>{window.vk={id:42};window.__deka={cmd:()=>false};let store={};for(let k of ['localStorage','sessionStorage'])Object.defineProperty(window,k,{value:{getItem:n=>store[n]||null,setItem:(n,v)=>store[n]=v,removeItem:n=>delete store[n]}});window.testLocation={hostname:'vk.ru',pathname:'/audios42',search:'',hash:'',origin:'https://vk.ru',href:'https://vk.ru/audios42',assign:u=>{window.navigation=u}};}''')
 for n in ['library-engine.js','library-runtime.js']:page.add_script_tag(content='(function(location){'+(S/'src'/n).read_text()+'})(window.testLocation);')
 page.evaluate('''()=>{setTimeout(()=>{
 mount.innerHTML='<div id="lateHost" style="height:200px;overflow-y:auto" data-total-count="60"><div id="tracks"></div></div>';
 let count=0;window.loadedBatches=0;function append(){for(let j=0;j<10&&count<60;j++,count++)tracks.insertAdjacentHTML('beforeend','<div class="audio_row" data-audio-id="42_'+count+'" style="height:48px"><b class="audio_row__title">Mine '+count+'</b></div>');window.loadedBatches++;}
 append();lateHost.addEventListener('scroll',()=>{if(count<60&&lateHost.scrollTop+lateHost.clientHeight>=lateHost.scrollHeight-50)append();});
 },600);}''')
 result=page.evaluate('async()=>{await DekaLibrary.collect({stepMs:40,settleMs:30,endMs:300,stalledMs:1600,maxMs:5000});return DekaLibrary.get()}')
 check('Delayed hydration uses the newly mounted native scroll container',page.evaluate('DekaLibrary.diagnostics().scrollElement')=='DIV#lateHost')
 check('Delayed list loads all 60 tracks in original order',len(result['items'])==60 and all(t['key']=='42_'+str(i) for i,t in enumerate(result['items'])))
 check('Personal total is matched after six native batches',result['complete'] and page.evaluate('window.loadedBatches')==6)
 check('No browser exceptions',not errors)
 b.close()
(O/'hydration-report.json').write_text(json.dumps({'tests':results,'errors':errors},ensure_ascii=False,indent=2))
assert all(r['passed'] for r in results)
