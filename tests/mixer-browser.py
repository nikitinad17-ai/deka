"""Real WebAudio signal tests + offline VK sign-in/playlist fixture. No credentials."""
import json, math, os, struct, tempfile, wave
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
results=[];errors=[]
def record(name,ok=True):
    assert ok,name
    results.append({'test':name,'passed':True});print('PASS',name,flush=True)
def mount(page,fixture,where='https://vk.ru/audios42'):
    # Pure local fixture: never navigate to VK or bypass the browser's network policy.
    page.set_content(fixture)
    page.evaluate('''u=>{var x=new URL(u);window.testLocation={hostname:x.hostname,pathname:x.pathname,search:x.search,hash:x.hash,origin:x.origin,href:x.href,assign:function(v){window.testNavigationTarget=v;}};}''',where)
    page.evaluate('''()=>{const store={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]}});Object.defineProperty(document,'cookie',{get:()=>'',set:v=>{}});}''')
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.evaluate('delete window.__deka')
    for n in ['vk-session.js','library-engine.js','deck-engine.js','vk-bridge.js','vk-mixer-policy.js','library-runtime.js','virtual-list.js','player-controls.js','mobile-overlay.js']:
        text=(ROOT/'src'/n).read_text()
        # Supply a simulated URL to the unchanged production hostname/session logic.
        page.add_script_tag(content='(function(location){\n'+text+'\n})(window.testLocation);')
    page.wait_for_function('window.DekaApp && window.DekaSession')
def slider(page,selector,value):
    page.locator(selector).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true,composed:true}));}',str(value))
    page.wait_for_timeout(170)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1200,'height':760})
    mount(page,(ROOT/'tests/fixtures/vk-virtual.html').read_text())
    prefix='#deka2-overlay '
    with tempfile.TemporaryDirectory() as td:
        files=[]
        for f in [220,330]:
            file=Path(td)/f'tone{f}.wav';files.append(str(file))
            with wave.open(str(file),'wb') as w:
                w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000)
                w.writeframes(b''.join(struct.pack('<h',int(2500*math.sin(2*math.pi*f*i/16000))) for i in range(16000*45)))
        page.locator(prefix+'#files').set_input_files(files)
        page.locator(prefix+'#listA .vlrow').first.click();page.locator(prefix+'#listB .vlrow').nth(1).click();page.wait_for_timeout(600)
        levels=lambda:page.evaluate('DekaApp.engine.levels()')
        base=levels();record('Real audio signal exists on independent A and B',base['A']>.02 and base['B']>.02)
        # Keyboard uses the browser's actual range-input handling, including input events.
        a=page.locator(prefix+'[data-gain=A]');a.focus();a.press('Home');page.wait_for_timeout(170)
        l=levels();record('A fader zero mutes measured A signal while B keeps playing',l['A']<1e-7 and l['B']>.02)
        a.press('End');page.wait_for_timeout(170);record('A fader End restores measured sound',levels()['A']>.02)
        slider(page,prefix+'[data-gain=B]',0);l=levels();record('B fader zero mutes B without muting A',l['B']<1e-7 and l['A']>.02)
        slider(page,prefix+'[data-gain=B]',100)
        slider(page,prefix+'#cross',-100);l=levels();record('Crossfader full A excludes B in actual audio',l['B']<1e-7 and l['A']>.04)
        slider(page,prefix+'#cross',100);l=levels();record('Crossfader full B excludes A in actual audio',l['A']<1e-7 and l['B']>.04)
        slider(page,prefix+'#cross',0);record('Centre crossfader restores both audio channels',levels()['A']>.02 and levels()['B']>.02)
        slider(page,prefix+'#master',0);l=levels();record('Master zero mutes final output but not pre-master meters',l['master']<1e-7 and l['A']>.02 and l['B']>.02)
        slider(page,prefix+'#master',80);record('Master restores final output',levels()['master']>.02)
        page.locator(prefix+'#muteA').click();page.wait_for_timeout(170);record('Mute A is wired to sound',levels()['A']<1e-7)
        page.locator(prefix+'#resetMix').click();page.wait_for_timeout(170);record('Reset restores sound and fader positions',levels()['A']>.02 and page.locator(prefix+'[data-gain=A]').input_value()=='100')
        page.evaluate('DekaApp.engine.seek("A",2);DekaApp.engine.hotCue("A",0,true);DekaApp.engine.seek("A",6);DekaApp.engine.hotCue("A",0,false)');page.wait_for_timeout(80)
        record('Hot cue returns local deck to stored position',abs(page.evaluate('DekaApp.engine.state.A.time')-2)<.4)
        slider(page,prefix+'[data-rate=A]',10);record('Tempo control changes playback rate state',abs(page.evaluate('DekaApp.engine.state.A.rate')-1.1)<1e-6)
        page.evaluate('DekaApp.engine.seek("A",1);DekaApp.engine.loop("A",1)');page.wait_for_timeout(1600)
        record('Local loop returns to the chosen interval while continuing playback',1<=page.evaluate('DekaApp.engine.state.A.time')<2.15 and not page.evaluate('DekaApp.engine.state.A.paused'))
        page.screenshot(path=str(OUT/'desktop-0.2.0.png'))
        page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(250)
        la=page.locator(prefix+'#listA').bounding_box();lb=page.locator(prefix+'#listB').bounding_box()
        record('Landscape retains two usable lists with extended controls',la['height']>65 and lb['height']>65)
        page.screenshot(path=str(OUT/'landscape-0.2.0.png'))
        # Test the production VK bridge with a genuine media element, not a mock volume method.
        page.evaluate('DekaApp.engine.pause("A");DekaApp.engine.pause("B")')
        raw=Path(files[0]).read_bytes();import base64
        page.evaluate('''async b64=>{window.__deka.cmd({type:'volume',value:0});window.siteAudio=new Audio(URL.createObjectURL(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:'audio/wav'})));await siteAudio.play();}''',base64.b64encode(raw).decode())
        record('VK desired zero volume applies before first audio play',page.evaluate('siteAudio.volume')==0)
        page.evaluate('window.__deka.cmd({type:"volume",value:.23});siteAudio.volume=1;');page.wait_for_timeout(100)
        record('VK volume cannot be silently reset by website player',abs(page.evaluate('siteAudio.volume')-.23)<1e-6)
        page.evaluate('''async()=>{siteAudio.pause();window.nextAudio=new Audio(siteAudio.src);await nextAudio.play();}''')
        record('VK next audio element inherits fader level',abs(page.evaluate('nextAudio.volume')-.23)<1e-6)
        page.evaluate('nextAudio.pause()')
    remote=browser.new_page(viewport={'width':1000,'height':700})
    mount(remote,(ROOT/'tests/fixtures/vk-virtual.html').read_text())
    remote.evaluate("""async b64=>{navigator.mediaSession.metadata=new MediaMetadata({title:'VK test',artist:'Artist'});window.siteAudio=new Audio(URL.createObjectURL(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:'audio/wav'})));await siteAudio.play();}""",base64.b64encode(raw).decode())
    remote.wait_for_function('DekaApp.engine.state.A.track && !DekaApp.engine.state.A.paused')
    slider(remote,prefix+'[data-gain=A]',0)
    record('VK fader A controls the actual site audio element',remote.evaluate('siteAudio.volume')==0)
    slider(remote,prefix+'[data-gain=A]',100);slider(remote,prefix+'#master',50);slider(remote,prefix+'#cross',-100)
    record('VK master and crossfader combine on the active stream',abs(remote.evaluate('siteAudio.volume')-.5)<1e-6)
    remote.evaluate("""async()=>{document.querySelectorAll('[data-testid=audiorow-tappable]').forEach(b=>b.onclick=()=>{navigator.mediaSession.metadata=new MediaMetadata({title:b.querySelector('[data-testid=MusicTrackRow_Title]').textContent,artist:b.querySelector('[data-testid=MusicTrackRow_Authors]').textContent});siteAudio.play();});DekaApp.engine.load('B',[{key:'42_0',title:'Track 0000',artist:'Artist 0',kind:'vk',duration:180}],0);await DekaApp.engine.play('B');}""")
    remote.wait_for_function('!DekaApp.engine.state.B.paused && !DekaApp.engine.state.B.pending')
    slider(remote,prefix+'#cross',100);slider(remote,prefix+'[data-gain=B]',40)
    record('VK stream assigned to B responds to B fader',abs(remote.evaluate('siteAudio.volume')-.2)<1e-6)
    slider(remote,prefix+'[data-gain=A]',0)
    record('Inactive A cannot mute the VK stream owned by B',abs(remote.evaluate('siteAudio.volume')-.2)<1e-6)
    slider(remote,prefix+'#master',0)
    record('VK Master zero reaches actual silence',remote.evaluate('siteAudio.volume')==0)
    guest=browser.new_page(viewport={'width':390,'height':844})
    mount(guest,'<html><body><form action="/login"><input name="email"><input type="password"><button>Войти</button></form></body></html>','https://vk.ru/audio')
    record('VK login form is not covered by the DJ interface','vkview' in guest.locator(prefix+'.app').get_attribute('class'))
    record('Sign-in state is guest rather than fabricated success',guest.evaluate('DekaSession.read().authenticated') is False)
    guest.evaluate('window.vk={id:42};document.querySelector("form").remove();DekaSession.refresh()');guest.wait_for_timeout(80)
    record('Session detects authenticated user and updates VK button','✓' in guest.locator(prefix+'#vkBtn').inner_text())
    authpage=browser.new_page(viewport={'width':390,'height':844})
    mount(authpage,'<html><body><form action="/login"><input name="email"><input type="password"><button>Войти</button></form></body></html>','https://id.vk.com/auth')
    record('VK ID authorization page remains fully unobstructed',authpage.locator(prefix+'.app').is_hidden())
    record('VK ID page is explicitly detected as unauthenticated',authpage.evaluate('DekaSession.read().authPage') and not authpage.evaluate('DekaSession.read().authenticated'))
    record('Credentials were never copied to app storage',guest.evaluate('Object.keys(localStorage).every(k=>!/(password|credential|token)/i.test(k))'))
    record('No browser runtime exceptions',not errors)
    browser.close()
(OUT/'mixer-report.json').write_text(json.dumps({'tests':results,'errors':errors,'environment':'Offline synthetic VK DOM + real Chromium audio'},ensure_ascii=False,indent=2))
