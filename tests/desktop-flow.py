"""Separate desktop player/source end-to-end test. --native uses installed WebView2.
Production parser, collector, player and IPC are used. VK responses are fixture HTML,
not the user's account. Fixtures remain outside src and are not shipped.
"""
import asyncio,base64,io,json,math,os,sys,wave,struct
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
RESULTS=[];ERRORS=[]
def check(name,condition):
 RESULTS.append({'test':name,'passed':bool(condition)});print(('PASS ' if condition else 'FAIL ')+name,flush=True);assert condition,name
buf=io.BytesIO()
with wave.open(buf,'wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000)
 f.writeframes(b''.join(struct.pack('<h',int(2500*math.sin(2*math.pi*330*i/8000))) for i in range(8000*30)))
AUDIO=base64.b64encode(buf.getvalue()).decode()
def row(i,other=False):
 import html
 data=json.dumps([i,42,'',('Other ' if other else 'Personal ')+str(i),'Fixture artist',30])
 return '<div class="audio_row" data-audio="'+html.escape(data,quote=True)+'" id="audio42_'+str(i)+'" style="height:48px"><button class="audio_row__play_btn" onclick="playTrack('+str(i)+')">Play</button><span class="audio_row__title_inner">'+('Other ' if other else 'Personal ')+str(i)+'</span><span class="audio_row__performers">Fixture artist</span></div>'
def fixture(full=False,login=False):
 if login:return '<!doctype html><meta charset=utf-8><input type=password><a href="https://vk.ru/audio">Test sign in</a>'
 header='''<!doctype html><meta charset="utf-8"><style>body{background:#edf0f4;font:14px system-ui;margin:20px}header{padding:12px}.audio_row{display:flex;align-items:center;gap:14px}.CatalogBlock__header{display:flex;justify-content:space-between}#host{overflow:auto;height:520px;background:white}h2{margin:8px}</style><script>window.vk={id:42};</script><nav><a href="/audio">Главная</a><a href="/audio?section=all">Моя музыка</a></nav>'''
 rec='<section data-section="recommendations"><h2>Микс по артистам</h2>'+''.join(row(900+i,True) for i in range(6))+'</section>'
 audio="""<script>window.testMedia=new Audio('data:audio/wav;base64,%s');window.playTrack=function(i){testMedia.pause();testMedia.currentTime=0;navigator.mediaSession.metadata=new MediaMetadata({title:'Personal '+i,artist:'Fixture artist'});testMedia.play();};</script>"""%AUDIO
 if not full:return header+'<section><h2>Слушать VK Микс</h2><p>Рекомендации для вас</p></section><section id="my-preview"><div class="CatalogBlock__header"><span class="CatalogBlock__title">Мои треки</span><a id="show-all" href="/audio?section=all">Показать все</a></div><div>'+''.join(row(i) for i in range(12))+'</div></section>'+rec+audio
 data=json.dumps([row(i) for i in range(240)],ensure_ascii=False)
 return header+'<section><h2>Все мои треки · 240</h2><div id="host" data-total-count="240"><div id="mine"></div><div id="sentinel" style="height:24px">Загрузка</div></div></section>'+rec+audio+'''<script>
 const tracks=%s;let count=0,busy=false;window.batches=0;window.hiddenBatchAttempts=0;
 function append(){mine.insertAdjacentHTML('beforeend',tracks.slice(count,count+24).join(''));count+=24;window.batches++;if(count>=tracks.length)sentinel.remove();}
 append();new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!busy&&count<tracks.length){if(document.hidden){window.hiddenBatchAttempts++;return;}busy=true;setTimeout(()=>{append();busy=false;},40);}},{root:host}).observe(sentinel);
 </script>'''%data
SOURCE_NAMES=['vk-session.js','library-engine.js','vk-bridge.js','vk-mixer-policy.js','library-runtime.js','source-link.js']
async def main():
 native='--native' in sys.argv
 app_origin='http://tauri.localhost' if native else 'http://127.0.0.1:38621'
 source_origin='https://vk.ru' if native else 'http://127.0.0.1:38622'
 async with async_playwright() as p:
  if native:
   browser=await p.chromium.connect_over_cdp(os.environ.get('DEKA_CDP','http://127.0.0.1:9225'))
   context=browser.contexts[0]
   for _ in range(100):
    players=[x for x in context.pages if 'tauri.localhost/desktop.html' in x.url]
    sources=[x for x in context.pages if 'vk.ru' in x.url or 'vk.com' in x.url]
    if players and sources:break
    await asyncio.sleep(.2)
   print('TARGETS',[x.url for x in context.pages],flush=True)
   check('Release creates distinct local-player and VK-source windows',bool(players and sources))
   ui,source=players[0],sources[0]
  else:
   browser=await p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
   context=await browser.new_context(viewport={'width':1200,'height':760})
   ui=await context.new_page();source=await context.new_page()
   async def emit(_,packet):
    try:await ui.evaluate('e=>window.TEST_RECEIVE&&window.TEST_RECEIVE(e)',packet)
    except Exception:pass
   await source.expose_binding('sourceEmit',emit)
   shim="window.fixtureLocation={get hostname(){return 'vk.ru'},get pathname(){return window.location.pathname},get search(){return window.location.search},get hash(){return window.location.hash},get origin(){return 'https://vk.ru'},get href(){return this.origin+this.pathname+this.search+this.hash},assign:function(v){let u=new URL(v,this.origin);window.location.assign(u.pathname+u.search+u.hash)}};"
   await source.add_init_script("window.__TAURI__={event:{emitTo:(target,name,payload)=>window.sourceEmit({payload})}};\n"+shim+'\n;\n'+'\n;\n'.join('(function(location){'+(ROOT/'src'/n).read_text()+'})(window.fixtureLocation);' for n in SOURCE_NAMES))
   async def invoke(_,name,args):
    if name=='source_cmd':await source.evaluate('(r)=>{if(window.DekaSource)window.DekaSource.receive(r.cmd,r.requestId);}',args)
    return None
   await ui.expose_binding('nativeInvoke',invoke)
   await ui.add_init_script("window.__TAURI__={core:{invoke:(n,a)=>window.nativeInvoke(n,a)},event:{listen:(n,fn)=>{window.TEST_RECEIVE=fn;return Promise.resolve(()=>{});}}};")
  for page in [ui,source]:page.on('pageerror',lambda e:ERRORS.append(str(e)))
  async def vkroute(route):
   u=route.request.url
   await route.fulfill(status=200,content_type='text/html; charset=utf-8',body=fixture(full='section=all' in u,login='/audio' not in u))
  await context.route(source_origin+'/**',vkroute)
  if not native:
   async def localroute(route):
    name=route.request.url.split(app_origin+'/',1)[1].split('?',1)[0];path=ROOT/'src'/name
    if path.is_file():await route.fulfill(status=200,content_type='text/html' if name.endswith('html') else 'application/javascript',body=path.read_bytes())
    else:await route.abort()
   await context.route(app_origin+'/**',localroute)
   await ui.goto(app_origin+'/desktop.html')
  else:await ui.reload()
  async def wait_ui(expression,timeout=15000):
   try:await ui.wait_for_function(expression,timeout=timeout)
   except Exception:
    print('ERRORS',ERRORS,flush=True)
    for tag,page in [('player',ui),('source',source)]:
     try:
      info=await page.evaluate('({url:location.href,session:window.DekaSession?.read(),library:window.DekaLibrary?{count:DekaLibrary.get().items.length,status:DekaLibrary.get().status,reason:DekaLibrary.get().reason}:null,diagnostics:window.DekaLibrary?.diagnostics(),batches:window.batches})')
      print('DIAGNOSTIC',tag,info,flush=True);await page.screenshot(path=str(OUT/(tag+'-failure.png')))
     except Exception as e:print('DIAGNOSTIC ERROR',str(e),flush=True)
    raise
  await source.goto(source_origin+'/audio')
  await wait_ui('window.DekaApp')
  check('Player stays in local Deka interface','/desktop.html' in ui.url)
  check('Startup opens tracks rather than DJ',await ui.locator('#deka2-overlay .library').is_visible() and not await ui.locator('#deka2-overlay #dj').is_visible())
  await wait_ui('DekaLibrary.get().items.length>=12')
  check('Own preview appears without recommendations',await ui.evaluate('DekaLibrary.get().items.every(t=>t.title.startsWith("Personal "))'))
  await source.wait_for_url('**/audio?section=all',timeout=15000)
  check('Show all is followed from landing before own-page gate',True)
  await wait_ui('DekaLibrary.get().complete&&DekaLibrary.get().items.length===240',90000)
  check('240 DOM entries cross the source-player link in order',await ui.evaluate('DekaLibrary.get().items.every((t,i)=>t.key==="42_"+i)'))
  check('Lazy loading happened in source',await source.evaluate('window.batches')==10)
  check('Native source was visible throughout lazy loading',await source.evaluate('window.hiddenBatchAttempts')==0)
  prefix='#deka2-overlay '
  await ui.locator(prefix+'#searchmain').fill('Personal 239')
  await ui.locator(prefix+'#listmain .vlrow').first.click()
  await wait_ui('DekaApp.engine.state.A.track?.key==="42_239"&&!DekaApp.engine.state.A.pending&&!DekaApp.engine.state.A.paused',90000)
  check('Last imported track starts through source command and media',await source.evaluate('!testMedia.paused && testMedia.currentTime>0'))
  check('Correct song, not first-row substitution',await source.evaluate('navigator.mediaSession.metadata.title')=='Personal 239')
  await ui.locator(prefix+'#djBtn').click()
  await ui.locator(prefix+'[data-gain=A]').evaluate('e=>{e.value=0;e.dispatchEvent(new Event("input",{bubbles:true,composed:true}));}')
  await source.wait_for_function('testMedia.volume===0')
  check('A fader mutes actual source audio across windows',True)
  await ui.locator(prefix+'#resetMix').click();await source.wait_for_function('testMedia.volume>0.5')
  check('Mixer reset restores source volume',True)
  await ui.locator(prefix+'#playA').click();await source.wait_for_function('testMedia.paused')
  check('Pause reaches source',True)
  await ui.locator(prefix+'#playA').click();await source.wait_for_function('!testMedia.paused')
  check('Resume reaches source',True)
  await ui.evaluate('window.survivalMarker="retained"');await source.reload();await asyncio.sleep(1)
  check('Source reload does not rebuild player or erase list',await ui.evaluate('window.survivalMarker==="retained"&&DekaLibrary.get().items.length===240'))
  check('Main window never becomes VK','/desktop.html' in ui.url)
  await ui.screenshot(path=str(OUT/('native-desktop-player.png' if native else 'desktop-player.png')))
  check('No runtime exceptions',not ERRORS)
  (OUT/('native-desktop-flow.json' if native else 'desktop-flow.json')).write_text(json.dumps({'tests':RESULTS,'errors':ERRORS,'scope':'release WebView2/Tauri with fixture pages' if native else 'two Chromium documents; IPC transport shim'},ensure_ascii=False,indent=2))
  await browser.close()
try:asyncio.run(main())
finally:(OUT/'desktop-flow-last.json').write_text(json.dumps({'tests':RESULTS,'errors':ERRORS},ensure_ascii=False,indent=2))
