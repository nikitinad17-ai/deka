"""Regression for wrong-account libraries and click-without-playback. No live VK account.
Uses production modules, simulated page URLs and real Chromium HTMLMediaElement audio.
DEKA_SOURCE_ROOT may point to the previous source to demonstrate regression failures.
"""
import base64, io, json, math, os, struct, wave
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(os.environ.get('DEKA_SOURCE_ROOT', Path(__file__).resolve().parents[1]))
OUT = Path(os.environ.get('DEKA_TEST_OUTPUT', ROOT/'test-output')); OUT.mkdir(parents=True, exist_ok=True)
results, errors = [], []
def record(name, value):
    results.append({'test':name, 'passed':bool(value)})
    print(('PASS ' if value else 'FAIL ')+name, flush=True)
def track(key='42_7', title='My actual track', artist='My artist'):
    return {'key':key, 'title':title, 'artist':artist, 'duration':12}
def row(key='42_7', title='My actual track', artist='My artist', parent=False):
    text=f'<span data-testid="MusicTrackRow_Title">{title}</span><span data-testid="MusicTrackRow_Authors">{artist}</span><span data-testid="MusicTrackRow_Duration">0:12</span>'
    core=f'<div data-testid="MusicTrackRow"><button data-testid="audiorow-tappable">{text}</button></div>'
    if parent: core=f'<button data-testid="audiorow-tappable"><div data-testid="MusicTrackRow">{text}</div></button>'
    return f'<div data-audio-id="{key}">{core}</div>'
def mount(browser, path='/audios42', vk=None, cookie='', rows='', saved=None, parent=False, hash_value=''):
    page=browser.new_page(viewport={'width':844,'height':440})
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('<html><head><style>button{min-height:40px}#list{height:280px;overflow:auto}</style></head><body><div id="list"><section><h2>Мои треки</h2>'+rows+'</section></div></body></html>')
    page.evaluate('''d=>{
      const u=new URL('https://vk.ru'+d.path+d.hash);window.testLocation={hostname:u.hostname,pathname:u.pathname,search:u.search,hash:u.hash,origin:u.origin,href:u.href,assign:u=>window.navigation=u};
      window.vk=d.vk;window.cookieValue=d.cookie;Object.defineProperty(document,'cookie',{configurable:true,get:()=>window.cookieValue});
      window.testStore=d.saved||{};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>window.testStore[k]||null,setItem:(k,v)=>window.testStore[k]=String(v),removeItem:k=>delete window.testStore[k]}});
      const tmp={};Object.defineProperty(window,'sessionStorage',{configurable:true,value:{getItem:k=>tmp[k]||null,setItem:(k,v)=>tmp[k]=String(v),removeItem:k=>delete tmp[k]}});
      window.captureCount=0;const orig=AudioContext.prototype.createMediaElementSource;AudioContext.prototype.createMediaElementSource=function(el){window.captureCount++;return orig.call(this,el);};
    }''', {'path':path,'hash':hash_value,'vk':vk if vk is not None else {'id':42},'cookie':cookie,'saved':saved})
    for name in ['vk-session.js','library-engine.js','deck-engine.js','vk-bridge.js','vk-mixer-policy.js','library-runtime.js','virtual-list.js','player-controls.js','mobile-overlay.js']:
        page.add_script_tag(content='(function(location){\n'+(ROOT/'src'/name).read_text()+'\n})(window.testLocation);')
    page.wait_for_function('window.DekaApp && window.DekaSession')
    return page

def install_audio(page, b64):
    page.evaluate('''data=>{
      window.audioURL=URL.createObjectURL(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'audio/wav'}));
      window.clicks=0;window.playErrors=[];
      document.querySelectorAll('[data-testid=audiorow-tappable]').forEach(button=>button.onclick=()=>{
        window.clicks++;
        if(window.siteAudio)window.siteAudio.pause();
        navigator.mediaSession.metadata=new MediaMetadata({title:button.querySelector('[data-testid=MusicTrackRow_Title]').textContent,artist:button.querySelector('[data-testid=MusicTrackRow_Authors]').textContent});
        window.siteAudio=new Audio(audioURL);siteAudio.play().catch(e=>playErrors.push(e.name));
      });
    }''', b64)

sound=io.BytesIO()
with wave.open(sound,'wb') as wav:
    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000)
    wav.writeframes(b''.join(struct.pack('<h',round(1500*math.sin(2*math.pi*220*i/8000))) for i in range(8000*12)))
b64=base64.b64encode(sound.getvalue()).decode()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    guest=mount(browser,path='/audio',vk={'user':{'id':987}},rows=row('987_9','Visitor song'))
    guest.wait_for_timeout(400)
    record('Viewed profile vk.user.id is not the signed-in identity',guest.evaluate('DekaSession.userId()')=='')
    record('Unknown account does not display public recommendation rows',len(guest.evaluate('DekaLibrary.get().items'))==0)
    conflict=mount(browser,path='/audios42',vk={'id':42},cookie='remixmid=777',rows=row())
    record('Conflicting viewer and session IDs block personal-library access',conflict.evaluate('DekaSession.read().authenticated') is not True)
    record('Conflicting identity does not choose a guessed own URL',conflict.evaluate('DekaLibrary.ownURL()===null'))
    loggedout=mount(browser,vk={'id':42},cookie='remixmid=0',rows=row())
    record('Explicit logged-out cookie overrides stale viewer ID',loggedout.evaluate('DekaSession.read().authenticated') is False)
    landing=mount(browser,path='/audio',rows=row('9_9','Recommended, not mine'))
    landing.wait_for_timeout(400)
    record('Authenticated landing page does not masquerade recommendations as own songs',len(landing.evaluate('DekaLibrary.get().items'))==0)
    foreign=mount(browser,path='/audios777',rows=row('777_8','Someone else'))
    foreign.wait_for_timeout(350)
    record('A visited foreign library is not accumulated into my library',len(foreign.evaluate('DekaLibrary.get().items'))==0)
    foreign.evaluate('DekaLibrary.collectMy()')
    record('My-library navigation uses viewer 42, not visited owner 777','/audios42#' in foreign.evaluate('window.navigation||""'))
    # Recommendations appended below the true personal list must not enter it.
    own=mount(browser,rows=row())
    own.evaluate('''html=>{var s=document.createElement('section');s.innerHTML='<h2>Рекомендации</h2>'+html;document.getElementById('list').appendChild(s);}''',row('5_5','Recommended tail'))
    own.wait_for_timeout(400)
    record('Personal-list adapter excludes the recommendation tail', [t['key'] for t in own.evaluate('DekaLibrary.adapter.read()')]==['42_7'])
    old=mount(browser,path='/audio',saved={'deka2:own-library:42':json.dumps({'source':'42|/audios42','count':1,'items':[track('9_9','Old unverified cache')]})})
    record('Previously unverified v2 cache is not silently treated as personal music',len(old.evaluate('DekaLibrary.get().items'))==0)
    cache={'schema':4,'accountId':'42','sourcePath':'/audios42','source':'42|/audios42','items':[track()],'count':1,'complete':False}
    cached=mount(browser,path='/audio',rows=row('9_9','Recommended'),saved={'deka2:own-library:v4:42':json.dumps(cache)})
    record('Verified personal cache restores on landing',[t['key'] for t in cached.evaluate('DekaLibrary.get().items')]==['42_7'])
    cached.evaluate('DekaLibrary.playKey("42_7",{side:"B",accountId:"42"})')
    target=cached.evaluate('window.navigation||""')
    record('Cached song is opened at its own source, not searched in discovery feed','/audios42#deka2-play=' in target)
    record('Navigation retains exact selected song and deck B','42_7' in target and '%22B%22' in target)
    # A no-op button must no longer be reported as success.
    noop=mount(browser,rows=row())
    val=noop.evaluate('DekaLibrary.playKey("42_7",{confirmMs:200})')
    record('Click without playing media is reported as failure',val is False)
    # Real play through a tappable parent, prefixed ID, and the production bridge.
    audio=mount(browser,rows=row('audio42_7',parent=True));install_audio(audio,b64)
    value=audio.evaluate('DekaLibrary.playKey("42_7",{confirmMs:1500})')
    record('Tappable parent and audio-prefixed ID start the exact native media',value is True)
    audio.wait_for_timeout(200)
    record('Native VK media actually advances in time',audio.evaluate('!!window.siteAudio&&!siteAudio.paused&&siteAudio.currentTime>.1'))
    record('VK-owned blob is not captured into a second WebAudio graph',audio.evaluate('captureCount')==0)
    audio.evaluate('__deka.cmd({type:"pause"})');paused=audio.evaluate('siteAudio.currentTime')
    resumed=audio.evaluate('DekaLibrary.playKey("42_7",{confirmMs:1500})')
    audio.wait_for_timeout(200)
    record('Resume does not click the row again or restart the selected song',resumed is True and audio.evaluate('clicks')==1 and audio.evaluate('siteAudio.currentTime')>paused)
    audio.evaluate('DekaApp.engine.setCross(-1);DekaApp.engine.setGain("A",0)');audio.wait_for_timeout(100)
    record('A fader still controls native VK media without WebAudio capture',audio.evaluate('siteAudio.volume')==0)
    # An explicit different account invalidates cached data and pending remote deck state.
    audio.evaluate('window.vk={id:77};DekaSession.refresh()');audio.wait_for_timeout(80)
    record('Account change clears remote decks instead of keeping old user tracks',audio.evaluate('DekaApp.engine.state.A.track===null&&DekaApp.engine.state.B.track===null'))
    record('Account change exposes no previous user cache',len(audio.evaluate('DekaLibrary.get().items'))==0)
    record('A stale account playback request is rejected',audio.evaluate('DekaLibrary.playKey("42_7",{accountId:"42",confirmMs:100,searchMs:100})') is False)
    record('Previously saved personal cache is retained, not destructively removed',audio.evaluate('!!testStore["deka2:own-library:v4:42"]'))
    # Test intent consumption separately (no fake server navigation).
    intent={'version':1,'accountId':'42','sourcePath':'/audios42','side':'B','createdAt':0,'track':track()}
    import time, urllib.parse
    intent['createdAt']=int(time.time()*1000)
    # Before mount's rAF restores the intent, button audio needs to be installed. Use underlying event delegation.
    pending=mount(browser, rows=row(),hash_value='#deka2-play='+urllib.parse.quote(json.dumps(intent)))
    # Mount already consumes intent in controls; the real audio callback is registered before confirm timeout.
    install_audio(pending,b64)
    pending.wait_for_timeout(450)
    # Request again through the real engine if the first click predated the fixture handler.
    pending.evaluate('DekaApp.engine.pause("B");DekaApp.engine.play("B")');pending.wait_for_timeout(500)
    record('Navigation restores the selected track to deck B',pending.evaluate('DekaApp.engine.state.B.track&&DekaApp.engine.state.B.track.key==="42_7"'))
    record('Confirmed start clears pending state on B',pending.evaluate('!DekaApp.engine.state.B.pending&&!DekaApp.engine.state.B.paused'))
    pending.screenshot(path=str(OUT/'vk-hotfix-landscape.png'))
    record('No browser runtime exceptions',not errors)
    browser.close()
report={'tests':results,'errors':errors,'environment':'Offline synthetic VK layout and account IDs; real native Chromium media; no live account validation'}
(OUT/'vk-reliability-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
assert all(t['passed'] for t in results), 'VK reliability regression failed'
