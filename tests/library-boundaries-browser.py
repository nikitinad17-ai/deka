"""Regressions for 'first songs only + unrelated tail'. Offline real DOM, no VK login.
The previous version is reproducible with DEKA_SOURCE_ROOT pointing to its src/.
"""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(os.environ.get('DEKA_SOURCE_ROOT',Path(__file__).resolve().parents[1]));O=Path(os.environ.get('DEKA_TEST_OUTPUT',R/'test-output'));O.mkdir(exist_ok=True,parents=True)
results=[];errors=[]
def check(name,ok):
 results.append({'test':name,'passed':bool(ok)});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
def row(i,title='Mine'):
 return f'<div data-testid="MusicTrackRow" data-audio-id="42_{i}" style="height:40px"><button data-testid="audiorow-tappable"><span data-testid="MusicTrackRow_Title">{title} {i}</span><span data-testid="MusicTrackRow_Authors">Artist</span></button></div>'
def mount(b,html,path='/audios42',script=''):
 page=b.new_page(viewport={'width':390,'height':740});page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<html><body>'+html+'</body></html>')
 page.evaluate('''path=>{window.vk={id:42};window.__deka={cmd:()=>true};let m={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>m[k]||null,setItem:(k,v)=>m[k]=String(v)}});const u=new URL('https://vk.ru'+path);window.testLocation={hostname:u.hostname,pathname:u.pathname,search:u.search,hash:'',origin:u.origin,href:u.href,assign:u=>window.navigation=u};}''',path)
 if script:page.evaluate(script)
 for f in ['library-engine.js','library-runtime.js']:page.add_script_tag(content='(function(location){\n'+(R/'src'/f).read_text()+'\n})(window.testLocation);')
 return page
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
 # Flat sibling headings used to inherit the first heading on the page.
 flat=mount(b,'<main><h2>Мои треки</h2><div>'+''.join(row(i) for i in range(12))+'</div><h2>Вам может понравиться</h2><div>'+''.join(row(200+i,'Unrelated') for i in range(9))+'</div></main>')
 got=flat.evaluate('DekaLibrary.adapter.read().map(t=>t.key)')
 check('Sibling recommendation heading excludes all unrelated tail rows',got==['42_'+str(i) for i in range(12)])
 # No readable heading in a recommendation block, only its native accessible/test label.
 attrs=mount(b,'<h2>Мои треки</h2><main>'+row(1)+'<div data-testid="music-recommendations">'+row(901,'Other')+'</div><section aria-label="Похожая музыка">'+row(902,'Other')+'</section></main>')
 check('Attribute-labelled recommendation blocks are excluded',attrs.evaluate('DekaLibrary.adapter.read().map(t=>t.key)')==['42_1'])
 # A shared page counter for several sections cannot certify a personal list as complete.
 counter=mount(b,'<main data-total-count="15"><section><h2>Мои треки</h2><div data-total-count="200">'+row(1)+'</div></section><h2>Популярное</h2>'+row(902,'Other')+'</main>')
 check('Personal count wins; shared recommendation count is ignored',counter.evaluate('DekaLibrary.adapter.total()')==200)
 # Modern route: selected personal tab + same personal scope. No account guessing.
 modern=mount(b,'<button role="tab" aria-selected="true">Мои треки</button><main><h2>Мои треки</h2>'+row(1)+'<h2>Для вас</h2>'+row(903,'Other')+'</main>','/audio?section=my')
 check('Personal section works on /audio?section=my',modern.evaluate('DekaLibrary.adapter.read().map(t=>t.key)')==['42_1'])
 discovery=mount(b,'<button role="tab" aria-selected="true">Для вас</button><h2>Мои треки</h2>'+row(1),'/audio')
 check('Selected recommendation tab does not become own collection',discovery.evaluate('DekaLibrary.adapter.read().length')==0)
 # Preview-to-full navigation uses the personal header button only, never recommendation links.
 link=mount(b,'<main><header><h2>Мои треки</h2><a href="/audio?section=my">Показать все 245</a></header>'+row(1)+'<h2>Вам понравится</h2><a href="/audios999">Показать все</a>'+row(999,'Other')+'</main>')
 link.evaluate('DekaLibrary.collect()')
 check('Show-all follows personal collection URL before scanning',link.evaluate('window.navigation||""')=='https://vk.ru/audio?section=my#deka-library=collect')
 # Clipped preview + show-all expansion + genuine lazy batch loading. Recs scroll separately.
 html='<h2>Мои треки · 160</h2><main id="scroll" style="height:260px;overflow-y:auto"><div id="clip" style="height:120px;overflow:hidden"></div><button id="all">Показать все</button><h2>Вам может понравиться</h2><div id="rec">'+row(999,'Other')+'</div></main>'
 js='''() => {
 window.available=12;window.opened=false;window.pending=false;window.recMoreClicks=0;
 window.renderRows=()=>{document.getElementById('clip').innerHTML=Array.from({length:available},(_,i)=>'<div data-testid="MusicTrackRow" data-audio-id="42_'+i+'" style="height:40px"><span data-testid="MusicTrackRow_Title">Mine '+i+'</span></div>').join('');};
 renderRows();document.getElementById('all').onclick=()=>{opened=true;all.remove();clip.style.height='auto';clip.style.overflow='visible';};
 scroll.addEventListener('scroll',()=>{});
 const host=document.getElementById('scroll');host.addEventListener('scroll',()=>{if(opened&&!pending&&available<160&&host.scrollTop+host.clientHeight>=clip.offsetTop+clip.offsetHeight-host.offsetTop-90){pending=true;host.setAttribute('aria-busy','true');setTimeout(()=>{available=Math.min(160,available+12);renderRows();pending=false;host.removeAttribute('aria-busy');},30);}});
 }'''.replace(" scroll.addEventListener('scroll',()=>{});",'')
 long=mount(b,html,script=js)
 check('Preview clip is not chosen as the native scroll host',long.evaluate('DekaLibrary.adapter.measure().height')==260)
 result=long.evaluate('''async()=>{await DekaLibrary.collect({stepMs:35,settleMs:40,endMs:250,stalledMs:2000,maxMs:15000});return DekaLibrary.get()}''')
 check('Show-all expands preview before walking lazy batches',long.evaluate('window.opened'))
 check('All 160 personal songs are loaded in order, zero recommendations', [t['key'] for t in result['items']]==['42_'+str(i) for i in range(160)])
 check('Only matched personal total permits complete=true',result['complete'] and result['count']==160 and result['expected']==160)
 # Native more is often a <div role=button> or anchor, not <button>.
 more=mount(b,'<main id="host" style="height:200px;overflow:auto"><h2>Мои треки · 55</h2><div id="mine">'+row(0)+'</div><a role="button" id="more">Показать ещё</a><h2>Рекомендуем</h2>'+row(990,'Other')+'<button id="recMore">Показать ещё</button></main>',script='''()=>{window.next=1;window.recClicks=0;recMore.onclick=()=>recClicks++;more.onclick=()=>{for(let n=0;n<18&&next<55;n++,next++)mine.insertAdjacentHTML('beforeend','<div data-testid="MusicTrackRow" data-audio-id="42_'+next+'" style="height:35px"><span data-testid="MusicTrackRow_Title">Mine '+next+'</span></div>');if(next===55)more.remove();};}''')
 r=more.evaluate('''async()=>{await DekaLibrary.collect({stepMs:80,settleMs:25,endMs:400,stalledMs:4000,maxMs:15000});return DekaLibrary.get()}''')
 check('Own native pagination link loads entire collection',r['count']==55 and r['complete'])
 check('Recommendation pagination is never clicked',more.evaluate('window.recClicks')==0)
 # Slow loader with known count must not cut down saved collection on retry.
 more.evaluate('document.getElementById("mine").replaceChildren()')
 r2=more.evaluate('''async()=>{await DekaLibrary.collect({stepMs:20,settleMs:10,endMs:100,stalledMs:200,maxMs:600});return DekaLibrary.get()}''')
 check('Partial retry keeps previously collected tail',r2['count']==55 and not r2['complete'])
 # No count is not evidence of a full list, even at page bottom.
 no_total=mount(b,'<h2>Мои треки</h2>'+row(0))
 rt=no_total.evaluate('''async()=>{await DekaLibrary.collect({stepMs:20,settleMs:10,endMs:100,stalledMs:400,maxMs:600});return DekaLibrary.get()}''')
 check('Unknown total is not advertised as complete',not rt['complete'])
 # Load sentinel must enter the real root viewport, not just receive a synthetic scroll event.
 io=mount(b,'<main id="host" style="height:200px;overflow-y:auto"><h2>Мои треки · 60</h2><div id="mine"></div><div id="sentinel" style="height:20px"></div><h2>Вам понравится</h2><div style="height:1200px">'+row(990,'Other')+'</div></main>',script="""()=>{
 window.limit=10;window.ioHits=0;window.busyIO=false;
 window.draw=()=>{mine.innerHTML=Array.from({length:limit},(_,i)=>'<div data-testid="MusicTrackRow" data-audio-id="42_'+i+'" style="height:40px"><span data-testid="MusicTrackRow_Title">Mine '+i+'</span></div>').join('');};draw();
 let observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!busyIO&&limit<60){busyIO=true;ioHits++;setTimeout(()=>{limit+=10;draw();busyIO=false;},30);}},{root:document.getElementById('host')});observer.observe(sentinel);
 }""")
 ir=io.evaluate('async()=>{await DekaLibrary.collect({stepMs:50,settleMs:20,endMs:500,stalledMs:3000,maxMs:15000});return DekaLibrary.get()}')
 check('IntersectionObserver sentinel loads five additional batches',io.evaluate('window.ioHits')==5)
 check('Recommendation feed does not prevent reaching 60 own tracks',ir['count']==60 and ir['complete'] and all(t['title'].startswith('Mine') for t in ir['items']))
 generic=mount(b,'<h2>Треки</h2>'+row(1)+'<h2>Плейлисты для вас</h2>'+row(990,'Other'))
 check('Generic Tracks heading is supported on the verified own page',generic.evaluate('DekaLibrary.adapter.read().map(t=>t.key)')==['42_1'])
 # The native page is uncovered during a scan and the app returns afterwards.
 for name in ['deck-engine.js','virtual-list.js','player-controls.js','mobile-overlay.js']:
  long.add_script_tag(content='(function(location){\n'+(R/'src'/name).read_text()+'\n})(window.testLocation);')
 long.wait_for_function('window.DekaApp')
 long.evaluate('window.dispatchEvent(new CustomEvent("deka2:library-scan",{detail:{active:true}}))')
 check('Native VK list is uncovered while collecting',not long.locator('#deka2-overlay .library').is_visible() and long.locator('#deka2-overlay .scanStop').is_visible())
 long.evaluate('window.dispatchEvent(new CustomEvent("deka2:library-scan",{detail:{active:false}}))')
 check('Full Deka list returns after collecting',long.locator('#deka2-overlay .library').is_visible())
 long.locator('#deka2-overlay #nativeListBtn').click()
 check('Real-list fallback opens VK without changing account or URL',long.locator('#deka2-overlay .app').evaluate('(e)=>e.classList.contains("vkview")') and not long.evaluate('window.navigation||""'))
 check('No runtime exceptions',not errors)
 b.close()
(O/'library-boundaries-report.json').write_text(json.dumps({'tests':results,'errors':errors,'scope':'offline fixture; not user account'},ensure_ascii=False,indent=2))
assert all(t['passed'] for t in results), 'Library boundary regression'
