"""Real Chromium document transitions on localhost, with simulated VK hostname.
No VK account, external network requests, real credentials or remote audio.
"""
import base64, io, json, math, os, struct, threading, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];O=R/'test-output';O.mkdir(exist_ok=True)
results=[];errors=[]
def check(name,ok):
 results.append({'test':name,'passed':bool(ok)});print(('PASS ' if ok else 'FAIL ')+name,flush=True);assert ok,name
names=['windows-native-view.js','vk-session.js','library-engine.js','deck-engine.js','vk-bridge.js','vk-mixer-policy.js','library-runtime.js','virtual-list.js','player-controls.js','mobile-overlay.js']
shim="""window.fixtureLocation={get hostname(){return window.location.pathname.startsWith('/vk-id')?'id.vk.ru':'vk.ru'},get pathname(){return window.location.pathname.replace('/vk-id','')},get search(){return window.location.search},get hash(){return window.location.hash},get origin(){return 'https://'+this.hostname},get href(){return this.origin+this.pathname+this.search+this.hash},assign:function(url){var u=new URL(url,this.origin);window.location.assign((u.hostname==='id.vk.ru'?'/vk-id':'')+u.pathname+u.search+u.hash);}};"""
scripts=shim+'\n;\n'+'\n;\n'.join('(function(location){\n'+(R/'src'/n).read_text()+'\n})(window.fixtureLocation);' for n in names)
fixture='''<!doctype html><meta charset="utf-8"><title>Local navigation test</title><style>body{font:17px system-ui;padding:20px;background:#eceff4}a,button{display:inline-block;padding:10px;margin:4px}#native-list{height:1600px}</style><script>window.vk={id:42};</script><h1>VK: локальная тестовая страница</h1><a id="own" href="/audios42">Мои треки</a><a id="redirect" href="/vk-id/login">Вход VK ID</a><button id="spa" onclick="history.pushState({},'', '/audio?section=my')">Мои треки SPA</button><section id="native-list"><h2>Мои треки</h2><button id="native-play">Включить тестовый звук</button><audio id="native-audio"></audio><div data-audio-id="42_1" data-testid="MusicTrackRow"><b data-testid="MusicTrackRow_Title">Local fixture track</b><i data-testid="MusicTrackRow_Authors">Test</i></div></section>'''
login='''<!doctype html><meta charset="utf-8"><h1>Тестовая форма входа</h1><input type="password" value="PRIVATE_SENTINEL_DO_NOT_EXPORT"><a id="back-login" href="/audio">Завершить тестовый вход</a>'''
buffer=io.BytesIO()
with wave.open(buffer,'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000)
 w.writeframes(b''.join(struct.pack('<h',int(2000*math.sin(2*math.pi*220*i/8000))) for i in range(8000*15)))
audio='data:audio/wav;base64,'+base64.b64encode(buffer.getvalue()).decode()
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  body=(login if self.path.startswith('/vk-id/') else fixture).encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 c=b.new_context(viewport={'width':1400,'height':900});external=[]
 def intercept(route):
  if route.request.url.startswith(origin+'/'):route.continue_()
  else:external.append(route.request.url);route.abort()
 c.route('**/*',intercept);c.add_init_script(scripts)
 page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 native=lambda:page.evaluate('DekaNativeView.isNative()')
 shown=lambda:page.locator('#deka2-overlay').count()>0 and page.locator('#deka2-overlay').is_visible()
 page.goto(origin+'/audio');page.locator('#deka2-native-toolbar #returnToDeka').wait_for()
 check('Windows boots into VK rather than empty DJ',native() and not shown())
 check('No app is mounted on a wide desktop before user choice',not page.locator('#deka2-overlay').count())
 page.wait_for_timeout(2100)
 check('No timed redirect or automatic collection',page.url==origin+'/audio' and not page.evaluate('DekaLibrary.isRunning()'))
 page.locator('#own').click();page.wait_for_timeout(1500)
 check('Full document link to My tracks stays native',page.url==origin+'/audios42' and native() and not shown())
 page.locator('#spa').click();page.wait_for_timeout(1400)
 check('SPA navigation and identity refresh cannot cover VK',page.url.endswith('/audio?section=my') and native() and not shown())
 page.locator('#deka2-native-toolbar #returnToDeka').click();page.wait_for_function('window.DekaApp')
 check('Only Return button opens Deka',not native() and shown())
 check('Return opens Tracks rather than automatic DJ',page.locator('#deka2-overlay .library').is_visible() and not page.locator('#deka2-overlay #dj').is_visible())
 before=page.url;page.wait_for_timeout(1500)
 check('Opening Deka does not start collection or navigation',page.url==before and not page.evaluate('DekaLibrary.isRunning()'))
 page.locator('#deka2-overlay #vkBtn').click()
 check('VK button hides the entire Deka overlay',native() and not shown())
 page.evaluate("window.dispatchEvent(new CustomEvent('deka2:library-scan',{detail:{active:false}}));window.dispatchEvent(new CustomEvent('deka2:session',{detail:DekaSession.read()}))")
 page.set_viewport_size({'width':850,'height':540});page.wait_for_timeout(500)
 check('Scan completion, session updates and resizing cannot reclaim screen',native() and not shown())
 page.evaluate('u=>{let a=document.getElementById("native-audio");a.src=u;a.volume=.63;document.getElementById("native-play").onclick=()=>a.play();}',audio)
 page.locator('#native-play').click();page.wait_for_timeout(600)
 state=page.evaluate('({paused:document.getElementById("native-audio").paused,time:document.getElementById("native-audio").currentTime,volume:document.getElementById("native-audio").volume})')
 check('Native control starts a real local audio element',not state['paused'] and state['time']>.15)
 check('Deka does not overwrite native page volume',abs(state['volume']-.63)<1e-6)
 page.evaluate('DekaApp.engine.setMaster(0);document.getElementById("native-audio").volume=.37');page.wait_for_timeout(450)
 check('Hidden mixer cannot mute or pin native audio volume',abs(page.evaluate('document.getElementById("native-audio").volume')-.37)<1e-6)
 check('Playing media does not switch back to Deka',native() and not shown())
 page.reload();page.wait_for_timeout(700)
 check('Reload keeps native VK visible',native() and not shown())
 page.locator('#redirect').click();page.wait_for_timeout(300)
 check('VK ID redirect displays form without Deka',page.locator('input[type=password]').is_visible() and native() and not shown())
 page.locator('#deka2-native-toolbar #returnToDeka').click()
 check('Return cannot cover a detected login form',native() and not shown())
 page.locator('#deka2-native-toolbar #details').click();text=page.locator('#deka2-native-toolbar #report').input_value()
 check('Diagnostics exclude password, cookies, identity and song names','PRIVATE_SENTINEL' not in text and 'Local fixture track' not in text and 'cookie' not in text and 'accountId' not in text)
 page.locator('#back-login').click();page.wait_for_timeout(1700)
 check('Return from VK ID keeps native music page open',native() and not shown() and page.url==origin+'/audio')
 page.goto(origin+'/audios42#deka-library=collect');page.wait_for_timeout(1600)
 check('Stale collect fragment cannot automatically start scanning',native() and not shown() and not page.evaluate('DekaLibrary.isRunning()'))
 page.locator('#deka2-native-toolbar #returnToDeka').click();page.wait_for_function('window.DekaApp')
 page.locator('#deka2-overlay #nativeListBtn').click();page.wait_for_timeout(1500)
 check('List in VK stays native without URL guessing',native() and not shown() and page.url==origin+'/audios42')
 page.locator('#deka2-native-toolbar #details').click();page.screenshot(path=str(O/'windows-native-view.png'))
 check('No browser runtime errors',not errors)
 check('No external network requests',not external)
 b.close()
server.shutdown()
(O/'windows-navigation-report.json').write_text(json.dumps({'tests':results,'errors':errors,'scope':'localhost synthetic documents and simulated VK hostname; actual Chromium navigation and local audio; not a real VK session'},ensure_ascii=False,indent=2))
