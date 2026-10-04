"""Main tab + personal preview + Show all. No account or network.
Old source via DEKA_SOURCE_ROOT reproduces the regression.
"""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];S=Path(os.environ.get('DEKA_SOURCE_ROOT',R))/'src';O=R/'test-output';O.mkdir(exist_ok=True)
results=[]
def row(i,other=False):
 return f'<div class="audio_row" data-audio-id="42_{i}" style="height:40px"><span class="audio_row__title_inner">'+('Other ' if other else 'Personal ')+str(i)+'</span><span class="audio_row__performers">Artist</span></div>'
def check(name,yes):results.append({'test':name,'passed':bool(yes)});print(('PASS ' if yes else 'FAIL ')+name,flush=True)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox'])
 page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<html><body><nav><a class="ui_tab_sel">Главная</a></nav><section><h2>Слушать VK Микс</h2></section><section id="mine"><div class="CatalogBlock__header"><span class="CatalogBlock__title">Мои треки</span><a id="more" href="/audio?section=all">Показать все</a></div><div>'+''.join(row(i) for i in range(12))+'</div></section><section data-section="recommendations"><h2>Микс по артистам</h2>'+''.join(row(900+i,True) for i in range(6))+'</section></body></html>')
 page.evaluate('''() => {
 window.vk={id:42};window.__deka={cmd:()=>false};const local={},sess={};
 for (const [name,data] of [['localStorage',local],['sessionStorage',sess]])Object.defineProperty(window,name,{value:{getItem:k=>data[k]||null,setItem:(k,v)=>data[k]=String(v),removeItem:k=>delete data[k]}});
 window.testLocation={hostname:'vk.ru',pathname:'/audio',search:'',hash:'',origin:'https://vk.ru',get href(){return this.origin+this.pathname+this.search;},assign:v=>window.attemptedURL=v};window.clicked=0;
 }''')
 for n in ['library-engine.js','library-runtime.js']:
  page.add_script_tag(content='(function(location){'+(S/n).read_text()+'})(window.testLocation);')
 check('Own preview on Main is readable before own-page validation',page.evaluate('DekaLibrary.adapter.read().length')==12)
 check('Preview never includes recommendation songs',page.evaluate('DekaLibrary.adapter.read().every(t=>t.title.startsWith("Personal "))'))
 page.evaluate('''html=>{more.onclick=e=>{e.preventDefault();window.clicked++;testLocation.search='?section=all';mine.innerHTML=html;};}''','<h2>Все мои треки · 75</h2>'+''.join(row(i) for i in range(75)))
 page.evaluate('async()=>{await DekaLibrary.collectMy();}')
 got=page.evaluate('DekaLibrary.get()')
 check('Show all click happens on Main before own-page gate',page.evaluate('window.clicked')==1)
 check('Clicked personal URL is accepted without fabricated navigation',page.evaluate('DekaLibrary.ownPage()&&!window.attemptedURL'))
 check('75 personal songs replace the 12-song preview in order',len(got['items'])==75 and [t['key'] for t in got['items']]==['42_'+str(i) for i in range(75)])
 check('Personal total confirms completeness, six recommendations excluded',got['complete'] and got['expected']==75)
 check('No runtime errors',not errors)
 b.close()
(O/'landing-entry-report.json').write_text(json.dumps({'tests':results,'errors':errors},indent=2))
if not all(r['passed'] for r in results):raise SystemExit(1)
