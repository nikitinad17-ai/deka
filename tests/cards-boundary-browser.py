"""Non-track editorial blocks are still outside My tracks. Synthetic DOM, no live VK."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];S=Path(os.environ.get('DEKA_SOURCE_ROOT',R));O=R/'test-output';O.mkdir(exist_ok=True)
results=[]
def check(name,ok):
 results.append({'test':name,'passed':bool(ok)});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
 page=b.new_page();page.set_content('''<html><body><main><section id="personal"><div class="CatalogBlock__header"><span class="CatalogBlock__title">Мои треки · 2</span></div><div id="own-rows"><div class="audio_row" data-audio-id="42_1"><b class="audio_row__title">Mine 1</b></div><div class="audio_row" data-audio-id="42_2"><b class="audio_row__title">Mine 2</b></div></div></section><section><h2>Микс по артистам</h2><a id="wrong" href="/audio?section=editorial">Показать все</a><div>Artist cards WITHOUT any audio-row elements</div></section><section><h2>Собрано редакцией</h2><button id="wrong2">Показать ещё</button></section></main></body></html>''')
 page.evaluate('''()=>{window.vk={id:42};window.__deka={cmd:()=>false};window.clicks=0;wrong.onclick=e=>{e.preventDefault();clicks++};wrong2.onclick=()=>clicks++;let store={};for(let k of ['localStorage','sessionStorage'])Object.defineProperty(window,k,{value:{getItem:n=>store[n]||null,setItem:(n,v)=>store[n]=v,removeItem:n=>delete store[n]}});window.testLocation={hostname:'vk.ru',pathname:'/audios42',search:'',hash:'',origin:'https://vk.ru',href:'https://vk.ru/audios42',assign:u=>{window.navigation=u}};}''')
 for n in ['library-engine.js','library-runtime.js']:page.add_script_tag(content='(function(location){'+(S/'src'/n).read_text()+'})(window.testLocation);')
 page.evaluate('async()=>DekaLibrary.collect({stepMs:20,settleMs:10,endMs:100,stalledMs:400,maxMs:1000})')
 check('Cards-only editorial Show all is not used as personal pagination',not page.evaluate('window.navigation||window.clicks'))
 check('Personal list with count loads completely despite editorial cards',page.evaluate('DekaLibrary.get().complete&&DekaLibrary.get().items.length===2'))
 b.close()
(O/'cards-boundary.json').write_text(json.dumps({'tests':results},indent=2));assert all(r['passed'] for r in results)
